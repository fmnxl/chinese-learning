from uuid import UUID
from datetime import datetime
from advanced_alchemy.base import UUIDAuditBase
from sqlalchemy import ForeignKey, String, Boolean, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship


class User(UUIDAuditBase):
    """User account for authentication and premium access."""
    
    __tablename__ = "users"
    
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Relationships
    progress: Mapped[list["CourseProgress"]] = relationship(
        back_populates="user", 
        cascade="all, delete-orphan"
    )


class Course(UUIDAuditBase):
    """HSK course (one per level 1-6)."""
    
    __tablename__ = "courses"
    
    level: Mapped[int]  # HSK 1-6
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Relationships
    chapters: Mapped[list["Chapter"]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="Chapter.order"
    )


class Chapter(UUIDAuditBase):
    """Chapter within a course, containing target vocabulary."""
    
    __tablename__ = "chapters"
    
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    order: Mapped[int]
    title: Mapped[str] = mapped_column(String(200))
    theme: Mapped[str] = mapped_column(String(100))
    target_vocabulary: Mapped[list[str]] = mapped_column(JSON, default=list)
    
    # Relationships
    course: Mapped["Course"] = relationship(back_populates="chapters")
    lessons: Mapped[list["Lesson"]] = relationship(
        back_populates="chapter",
        cascade="all, delete-orphan",
        order_by="Lesson.order"
    )


class Lesson(UUIDAuditBase):
    """Individual lesson within a chapter."""
    
    __tablename__ = "lessons"
    
    chapter_id: Mapped[UUID] = mapped_column(ForeignKey("chapters.id"))
    order: Mapped[int]
    type: Mapped[str] = mapped_column(String(50))  # 'vocabulary' | 'reading' | 'exercise'
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # Generated content
    
    # Relationships
    chapter: Mapped["Chapter"] = relationship(back_populates="lessons")


class CourseProgress(UUIDAuditBase):
    """User's progress through a course."""
    
    __tablename__ = "course_progress"
    
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    current_chapter: Mapped[int] = mapped_column(default=0)
    current_lesson: Mapped[int] = mapped_column(default=0)
    chapter_scores: Mapped[dict] = mapped_column(JSON, default=dict)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    
    # Relationships
    user: Mapped["User"] = relationship(back_populates="progress")
