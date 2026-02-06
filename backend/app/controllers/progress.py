"""User progress controller."""
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import UUID

from litestar import Controller, get, post
from litestar.exceptions import HTTPException
from litestar.security.jwt import Token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CourseProgress, Course, User

if TYPE_CHECKING:
    from litestar import Request


@dataclass
class ProgressDTO:
    course_id: UUID
    course_title: str
    current_chapter: int
    current_lesson: int
    chapter_scores: dict


@dataclass
class UpdateProgressDTO:
    current_chapter: int
    current_lesson: int
    chapter_scores: dict | None = None


class ProgressController(Controller):
    """User progress tracking."""
    
    path = "/progress"
    
    @get("/")
    async def get_all_progress(
        self,
        db_session: AsyncSession,
        request: "Request[User, Token, Any]",
    ) -> list[ProgressDTO]:
        """Get user's progress across all courses."""
        user = request.user
        
        result = await db_session.execute(
            select(CourseProgress, Course)
            .join(Course, CourseProgress.course_id == Course.id)
            .where(CourseProgress.user_id == user.id)
        )
        rows = result.all()
        
        return [
            ProgressDTO(
                course_id=progress.course_id,
                course_title=course.title,
                current_chapter=progress.current_chapter,
                current_lesson=progress.current_lesson,
                chapter_scores=progress.chapter_scores,
            )
            for progress, course in rows
        ]
    
    @get("/{course_id:uuid}")
    async def get_course_progress(
        self,
        course_id: UUID,
        db_session: AsyncSession,
        request: "Request[User, Token, Any]",
    ) -> ProgressDTO:
        """Get user's progress for a specific course."""
        user = request.user
        
        result = await db_session.execute(
            select(CourseProgress, Course)
            .join(Course, CourseProgress.course_id == Course.id)
            .where(
                CourseProgress.user_id == user.id,
                CourseProgress.course_id == course_id,
            )
        )
        row = result.one_or_none()
        
        if not row:
            # Check if course exists
            course_result = await db_session.execute(
                select(Course).where(Course.id == course_id)
            )
            course = course_result.scalar_one_or_none()
            if not course:
                raise HTTPException(status_code=404, detail="Course not found")
            
            # Return empty progress
            return ProgressDTO(
                course_id=course_id,
                course_title=course.title,
                current_chapter=0,
                current_lesson=0,
                chapter_scores={},
            )
        
        progress, course = row
        return ProgressDTO(
            course_id=progress.course_id,
            course_title=course.title,
            current_chapter=progress.current_chapter,
            current_lesson=progress.current_lesson,
            chapter_scores=progress.chapter_scores,
        )
    
    @post("/{course_id:uuid}")
    async def update_progress(
        self,
        course_id: UUID,
        data: UpdateProgressDTO,
        db_session: AsyncSession,
        request: "Request[User, Token, Any]",
    ) -> ProgressDTO:
        """Update user's progress for a course."""
        user = request.user
        
        # Get or create progress
        result = await db_session.execute(
            select(CourseProgress)
            .where(
                CourseProgress.user_id == user.id,
                CourseProgress.course_id == course_id,
            )
        )
        progress = result.scalar_one_or_none()
        
        if not progress:
            # Verify course exists
            course_result = await db_session.execute(
                select(Course).where(Course.id == course_id)
            )
            course = course_result.scalar_one_or_none()
            if not course:
                raise HTTPException(status_code=404, detail="Course not found")
            
            progress = CourseProgress(
                user_id=user.id,
                course_id=course_id,
                current_chapter=data.current_chapter,
                current_lesson=data.current_lesson,
                chapter_scores=data.chapter_scores or {},
            )
            db_session.add(progress)
        else:
            progress.current_chapter = data.current_chapter
            progress.current_lesson = data.current_lesson
            if data.chapter_scores:
                # Merge scores
                progress.chapter_scores = {
                    **progress.chapter_scores,
                    **data.chapter_scores,
                }
        
        await db_session.flush()
        
        # Get course title for response
        course_result = await db_session.execute(
            select(Course).where(Course.id == course_id)
        )
        course = course_result.scalar_one()
        
        return ProgressDTO(
            course_id=progress.course_id,
            course_title=course.title,
            current_chapter=progress.current_chapter,
            current_lesson=progress.current_lesson,
            chapter_scores=progress.chapter_scores,
        )
