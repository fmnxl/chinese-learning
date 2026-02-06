"""Course seeding script - populates database with HSK course structure."""
import asyncio
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.models.base import UUIDAuditBase, Course, Chapter, Lesson
from app.services.vocabulary import build_course_structure

settings = get_settings()


async def seed_course(session: AsyncSession, level: int, vocab_path: Path) -> Course:
    """
    Create or update a course for the given HSK level.
    
    - Creates course record
    - Creates chapter records with vocabulary
    - Creates lesson stubs (content generated on-demand)
    """
    # Build course structure from vocabulary
    structure = build_course_structure(vocab_path, level)
    
    # Check if course already exists
    result = await session.execute(
        select(Course).where(Course.hsk_level == level)
    )
    course = result.scalar_one_or_none()
    
    if course:
        print(f"Course HSK {level} already exists, updating...")
        course.title = structure["title"]
        course.description = structure["description"]
    else:
        course = Course(
            title=structure["title"],
            description=structure["description"],
            hsk_level=level,
            is_active=True,
        )
        session.add(course)
    
    await session.flush()
    
    # Create chapters
    for chapter_data in structure["chapters"]:
        # Check if chapter exists
        result = await session.execute(
            select(Chapter).where(
                Chapter.course_id == course.id,
                Chapter.order == chapter_data["order"]
            )
        )
        chapter = result.scalar_one_or_none()
        
        if not chapter:
            chapter = Chapter(
                course_id=course.id,
                order=chapter_data["order"],
                title=chapter_data["title"],
                vocabulary_target=chapter_data["vocabulary"],
            )
            session.add(chapter)
        else:
            chapter.title = chapter_data["title"]
            chapter.vocabulary_target = chapter_data["vocabulary"]
        
        await session.flush()
        
        # Create lesson stubs for each chapter
        lesson_types = [
            ("vocabulary", f"Vocabulary: {chapter_data['theme'].title()}"),
            ("reading", "Reading Practice"),
            ("quiz", "Chapter Quiz"),
        ]
        
        for order, (lesson_type, title) in enumerate(lesson_types, 1):
            result = await session.execute(
                select(Lesson).where(
                    Lesson.chapter_id == chapter.id,
                    Lesson.order == order
                )
            )
            lesson = result.scalar_one_or_none()
            
            if not lesson:
                lesson = Lesson(
                    chapter_id=chapter.id,
                    order=order,
                    title=title,
                    lesson_type=lesson_type,
                    content=None,  # Generated on-demand
                )
                session.add(lesson)
    
    await session.commit()
    print(f"✓ Seeded HSK {level}: {len(structure['chapters'])} chapters")
    return course


async def seed_all_courses(vocab_path: Path):
    """Seed courses for all HSK levels."""
    engine = create_async_engine(settings.database_url)
    
    async with engine.begin() as conn:
        await conn.run_sync(UUIDAuditBase.metadata.create_all)
    
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        for level in range(1, 8):  # HSK 1-7
            await seed_course(session, level, vocab_path)
    
    await engine.dispose()
    print("✓ All courses seeded!")


if __name__ == "__main__":
    # Default path to vocabulary JSON
    vocab_path = Path(__file__).parent.parent.parent.parent / "hsk_vocabulary.json"
    
    if not vocab_path.exists():
        print(f"Error: Vocabulary file not found at {vocab_path}")
        exit(1)
    
    asyncio.run(seed_all_courses(vocab_path))
