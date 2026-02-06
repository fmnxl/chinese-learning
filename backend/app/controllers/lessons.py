"""Lesson controller with on-demand content generation."""
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import UUID

from litestar import Controller, get
from litestar.exceptions import HTTPException, NotFoundException
from litestar.security.jwt import Token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Lesson, Chapter, User
from app.services.llm import generate_passage, generate_questions
from app.services.vocabulary import load_vocabulary, VocabularyEntry

if TYPE_CHECKING:
    from litestar import Request


@dataclass
class VocabularyItemDTO:
    simplified: str
    traditional: str
    pinyin: str
    meanings: list[str]


@dataclass
class SentenceDTO:
    chinese: str
    pinyin: str
    english: str


@dataclass
class ReadingContentDTO:
    title: str
    sentences: list[SentenceDTO]
    english_summary: str


@dataclass
class QuestionDTO:
    type: str
    question_chinese: str
    question_english: str
    options: list[str]
    correct_answer: int


@dataclass
class LessonContentDTO:
    lesson_id: str
    lesson_type: str
    title: str
    vocabulary: list[VocabularyItemDTO] | None = None
    reading: ReadingContentDTO | None = None
    questions: list[QuestionDTO] | None = None


# Cache vocabulary entries in memory
_vocab_cache: dict[str, VocabularyEntry] = {}


def get_vocab_map() -> dict[str, VocabularyEntry]:
    """Get or build vocabulary lookup map."""
    global _vocab_cache
    if not _vocab_cache:
        from pathlib import Path
        vocab_path = Path(__file__).parent.parent.parent / "hsk_vocabulary.json"
        if vocab_path.exists():
            entries = load_vocabulary(vocab_path)
            _vocab_cache = {e.simplified: e for e in entries}
    return _vocab_cache


class LessonController(Controller):
    """Lesson content with on-demand generation."""
    
    path = "/lessons"
    
    @get("/{lesson_id:uuid}")
    async def get_lesson_content(
        self,
        lesson_id: UUID,
        db_session: AsyncSession,
        request: "Request[User, Token, Any]",
    ) -> LessonContentDTO:
        """
        Get lesson content, generating if needed.
        
        For vocabulary lessons: returns word list from chapter vocabulary
        For reading lessons: generates passage using LLM (cached)
        For quiz lessons: generates questions using LLM (cached)
        """
        # Get lesson with chapter
        result = await db_session.execute(
            select(Lesson)
            .options(selectinload(Lesson.chapter).selectinload(Chapter.course))
            .where(Lesson.id == lesson_id)
        )
        lesson = result.scalar_one_or_none()
        
        if not lesson:
            raise NotFoundException(detail="Lesson not found")
        
        chapter = lesson.chapter
        vocab_map = get_vocab_map()
        
        # Get vocabulary entries for this chapter
        chapter_vocab = []
        for word in chapter.vocabulary_target or []:
            if word in vocab_map:
                entry = vocab_map[word]
                chapter_vocab.append(VocabularyItemDTO(
                    simplified=entry.simplified,
                    traditional=entry.traditional,
                    pinyin=entry.pinyin,
                    meanings=entry.meanings,
                ))
        
        if lesson.lesson_type == "vocabulary":
            return LessonContentDTO(
                lesson_id=str(lesson.id),
                lesson_type=lesson.lesson_type,
                title=lesson.title,
                vocabulary=chapter_vocab,
            )
        
        elif lesson.lesson_type == "reading":
            # Check if content already generated
            if lesson.content and "reading" in lesson.content:
                reading_data = lesson.content["reading"]
                return LessonContentDTO(
                    lesson_id=str(lesson.id),
                    lesson_type=lesson.lesson_type,
                    title=lesson.title,
                    vocabulary=chapter_vocab,
                    reading=ReadingContentDTO(
                        title=reading_data["title"],
                        sentences=[SentenceDTO(**s) for s in reading_data["sentences"]],
                        english_summary=reading_data["english_summary"],
                    ),
                )
            
            # Generate reading passage
            target_words = [v.simplified for v in chapter_vocab]
            
            # Get known words from previous chapters
            known_words = []
            if chapter.order > 1:
                prev_result = await db_session.execute(
                    select(Chapter)
                    .where(
                        Chapter.course_id == chapter.course_id,
                        Chapter.order < chapter.order
                    )
                )
                for prev_chapter in prev_result.scalars():
                    known_words.extend(prev_chapter.vocabulary_target or [])
            
            passage = await generate_passage(
                level=chapter.course.hsk_level,
                target_vocab=target_words[:15],  # Limit for focused content
                known_vocab=known_words,
                theme=chapter.title.split(": ")[-1] if ": " in chapter.title else "daily life",
            )
            
            # Cache the generated content
            lesson.content = lesson.content or {}
            lesson.content["reading"] = {
                "title": passage.title,
                "sentences": passage.sentences,
                "english_summary": passage.english_summary,
            }
            await db_session.flush()
            
            return LessonContentDTO(
                lesson_id=str(lesson.id),
                lesson_type=lesson.lesson_type,
                title=lesson.title,
                vocabulary=chapter_vocab,
                reading=ReadingContentDTO(
                    title=passage.title,
                    sentences=[SentenceDTO(**s) for s in passage.sentences],
                    english_summary=passage.english_summary,
                ),
            )
        
        elif lesson.lesson_type == "quiz":
            # Check if content already generated
            if lesson.content and "questions" in lesson.content:
                return LessonContentDTO(
                    lesson_id=str(lesson.id),
                    lesson_type=lesson.lesson_type,
                    title=lesson.title,
                    vocabulary=chapter_vocab,
                    questions=[QuestionDTO(**q) for q in lesson.content["questions"]],
                )
            
            # Need a reading passage first - get from reading lesson
            reading_result = await db_session.execute(
                select(Lesson).where(
                    Lesson.chapter_id == chapter.id,
                    Lesson.lesson_type == "reading"
                )
            )
            reading_lesson = reading_result.scalar_one_or_none()
            
            if not reading_lesson or not reading_lesson.content:
                raise HTTPException(
                    status_code=400,
                    detail="Complete the reading lesson first to unlock the quiz"
                )
            
            # Generate questions based on reading passage
            from app.services.llm import GeneratedPassage
            
            reading_data = reading_lesson.content["reading"]
            passage = GeneratedPassage(
                title=reading_data["title"],
                chinese_text="".join(s["chinese"] for s in reading_data["sentences"]),
                sentences=reading_data["sentences"],
                english_summary=reading_data["english_summary"],
            )
            
            target_words = [v.simplified for v in chapter_vocab]
            questions = await generate_questions(
                level=chapter.course.hsk_level,
                passage=passage,
                target_vocab=target_words,
            )
            
            # Cache questions
            lesson.content = lesson.content or {}
            lesson.content["questions"] = questions
            await db_session.flush()
            
            return LessonContentDTO(
                lesson_id=str(lesson.id),
                lesson_type=lesson.lesson_type,
                title=lesson.title,
                vocabulary=chapter_vocab,
                questions=[QuestionDTO(**q) for q in questions],
            )
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown lesson type: {lesson.lesson_type}")
