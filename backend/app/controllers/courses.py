"""Course and lesson controllers."""
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import UUID

from litestar import Controller, get
from litestar.exceptions import HTTPException, PermissionDeniedException
from litestar.security.jwt import Token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Course, Chapter, Lesson, User

if TYPE_CHECKING:
    from litestar import Request


@dataclass
class ChapterSummaryDTO:
    id: UUID
    order: int
    title: str
    theme: str
    vocabulary_count: int


@dataclass
class CourseSummaryDTO:
    id: UUID
    level: int
    title: str
    description: str
    is_premium: bool
    chapter_count: int


@dataclass
class CourseDetailDTO:
    id: UUID
    level: int
    title: str
    description: str
    is_premium: bool
    chapters: list[ChapterSummaryDTO]


@dataclass
class LessonDTO:
    id: UUID
    order: int
    type: str
    title: str
    content: dict | None


class CourseController(Controller):
    """Course browsing and content access."""
    
    path = "/courses"
    
    @get("/")
    async def list_courses(self, db_session: AsyncSession) -> list[CourseSummaryDTO]:
        """List all available courses (public)."""
        result = await db_session.execute(
            select(Course).options(selectinload(Course.chapters))
        )
        courses = result.scalars().all()
        
        return [
            CourseSummaryDTO(
                id=course.id,
                level=course.level,
                title=course.title,
                description=course.description,
                is_premium=course.is_premium,
                chapter_count=len(course.chapters),
            )
            for course in courses
        ]
    
    @get("/{course_id:uuid}")
    async def get_course(
        self, 
        course_id: UUID, 
        db_session: AsyncSession,
        request: "Request[User | None, Token | None, Any]",
    ) -> CourseDetailDTO:
        """Get course details with chapters (premium content requires auth)."""
        result = await db_session.execute(
            select(Course)
            .options(selectinload(Course.chapters))
            .where(Course.id == course_id)
        )
        course = result.scalar_one_or_none()
        
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        
        # Check premium access
        user = getattr(request, "user", None)
        if course.is_premium and (not user or not user.is_premium):
            # Return limited view for non-premium users
            # Only show first chapter as preview
            preview_chapters = course.chapters[:1] if course.chapters else []
            return CourseDetailDTO(
                id=course.id,
                level=course.level,
                title=course.title,
                description=course.description,
                is_premium=course.is_premium,
                chapters=[
                    ChapterSummaryDTO(
                        id=ch.id,
                        order=ch.order,
                        title=ch.title,
                        theme=ch.theme,
                        vocabulary_count=len(ch.target_vocabulary),
                    )
                    for ch in preview_chapters
                ],
            )
        
        return CourseDetailDTO(
            id=course.id,
            level=course.level,
            title=course.title,
            description=course.description,
            is_premium=course.is_premium,
            chapters=[
                ChapterSummaryDTO(
                    id=ch.id,
                    order=ch.order,
                    title=ch.title,
                    theme=ch.theme,
                    vocabulary_count=len(ch.target_vocabulary),
                )
                for ch in course.chapters
            ],
        )
    
    @get("/{course_id:uuid}/chapters/{chapter_order:int}/lessons/{lesson_order:int}")
    async def get_lesson(
        self,
        course_id: UUID,
        chapter_order: int,
        lesson_order: int,
        db_session: AsyncSession,
        request: "Request[User, Token, Any]",
    ) -> LessonDTO:
        """Get lesson content (premium only)."""
        # Get course with chapter and lesson
        result = await db_session.execute(
            select(Lesson)
            .join(Chapter)
            .join(Course)
            .where(
                Course.id == course_id,
                Chapter.order == chapter_order,
                Lesson.order == lesson_order,
            )
            .options(selectinload(Lesson.chapter).selectinload(Chapter.course))
        )
        lesson = result.scalar_one_or_none()
        
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        # Check premium access
        course = lesson.chapter.course
        user = request.user
        
        # Allow chapter 1 as free preview
        if course.is_premium and chapter_order > 1:
            if not user or not user.is_premium:
                raise PermissionDeniedException(
                    detail="Premium subscription required"
                )
        
        return LessonDTO(
            id=lesson.id,
            order=lesson.order,
            type=lesson.type,
            title=lesson.title,
            content=lesson.content,
        )
