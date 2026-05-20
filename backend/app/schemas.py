from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field


# === auth ===
class LoginIn(BaseModel):
    login: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# === user ===
class UserOut(BaseModel):
    id: int
    login: str
    email: str
    name: str
    surname: str
    user_type: str
    branch: str
    level: int
    points: int
    status: str
    avatar_initials: str
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    login: str
    email: EmailStr
    name: str
    surname: str = ""
    password: str
    user_type: str = "Learner-Type"
    branch: str = "MGA"


# === course ===
class CourseOut(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    category: str
    description: str = ""
    status: str
    instructor_id: Optional[int] = None
    thumbnail_seed: int
    icon: str
    units_count: int = 0
    enrollments_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class CourseCreate(BaseModel):
    name: str
    code: Optional[str] = None
    category: str = "Geral"
    description: str = ""
    status: str = "active"
    thumbnail_seed: int = 1
    icon: str = "book-open"


class CourseUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


# === unit ===
class UnitOut(BaseModel):
    id: int
    course_id: int
    order_index: int
    type: str
    title: str
    duration_min: int
    content: dict = {}

    class Config:
        from_attributes = True


class UnitCreate(BaseModel):
    type: str
    title: str
    duration_min: int = 5
    content: dict = {}


# === enrollment ===
class EnrollmentOut(BaseModel):
    id: int
    user_id: int
    course_id: int
    role: str
    enrolled_at: datetime
    completed_at: Optional[datetime] = None
    progress_pct: int = 0

    class Config:
        from_attributes = True


class EnrollmentCreate(BaseModel):
    user_id: int
    course_id: int
    role: str = "Estudante"


class EnrollmentMe(BaseModel):
    course_id: int


# === progress ===
class ProgressIn(BaseModel):
    unit_id: int
    completion_pct: int = Field(ge=0, le=100)
    score: Optional[int] = None


class ProgressOut(BaseModel):
    id: int
    user_id: int
    unit_id: int
    completion_pct: int
    completed_at: Optional[datetime] = None
    score: Optional[int] = None

    class Config:
        from_attributes = True


# === leaderboard ===
class LeaderboardRow(BaseModel):
    user_id: int
    name: str
    surname: str
    avatar_initials: str
    branch: str
    points: int
    level: int
    badges_count: int
    rank: int


# === badge ===
class BadgeOut(BaseModel):
    id: int
    name: str
    description: str
    category: str
    icon: str
    points: int
    earned_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# === user detail ===
class UserDetail(UserOut):
    enrollments: List[EnrollmentOut] = []
    badges: List[BadgeOut] = []


# === course detail ===
class CourseDetail(CourseOut):
    units: List[UnitOut] = []
    instructor: Optional[UserOut] = None


# resolve forward
TokenOut.model_rebuild()
