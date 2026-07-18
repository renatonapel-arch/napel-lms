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
    price_amount: float = 0
    price_currency: str = "BRL"
    capacity: Optional[int] = None
    is_hidden: bool = False
    is_locked: bool = False
    ai_coach: bool = False
    issue_certificate: bool = True
    certificate_min_score: int = 70
    sequential: bool = False
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
    sequential: bool = False


class CourseUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    thumbnail_seed: Optional[int] = None
    icon: Optional[str] = None
    price_amount: Optional[float] = None
    price_currency: Optional[str] = None
    capacity: Optional[int] = None
    is_hidden: Optional[bool] = None
    is_locked: Optional[bool] = None
    ai_coach: Optional[bool] = None
    issue_certificate: Optional[bool] = None
    certificate_min_score: Optional[int] = None
    sequential: Optional[bool] = None


# === unit ===
class UnitOut(BaseModel):
    id: int
    course_id: int
    order_index: int
    type: str
    title: str
    duration_min: int
    section: Optional[str] = None
    content: dict = {}

    class Config:
        from_attributes = True


class UnitCreate(BaseModel):
    type: str
    title: str
    duration_min: int = 5
    section: Optional[str] = None
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


# === quiz ===
class QuizAnswerIn(BaseModel):
    selected_idx: int


class QuizAnswerOut(BaseModel):
    correct: bool
    correct_idx: int
    explanation: Optional[str] = None
    score_pct: int = 0
    passed: bool = False
    earned_points: int = 0
    next_unit_id: Optional[int] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    surname: Optional[str] = None
    email: Optional[EmailStr] = None
    user_type: Optional[str] = None
    branch: Optional[str] = None
    status: Optional[str] = None


class EnrollmentRoleUpdate(BaseModel):
    role: str  # Professor | Estudante | Trainer


# === unit update ===
class UnitUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    duration_min: Optional[int] = None
    content: Optional[dict] = None
    order_index: Optional[int] = None
    section: Optional[str] = None


class UnitReorderItem(BaseModel):
    id: int
    order_index: int


# === bulk enroll ===
class BulkEnrollIn(BaseModel):
    user_ids: List[int]
    role: str = "Estudante"


# === group ===
class GroupOut(BaseModel):
    id: int
    name: str
    description: str = ""
    status: str = "active"
    users_count: int = 0
    courses_count: int = 0

    class Config:
        from_attributes = True


class GroupCreate(BaseModel):
    name: str
    description: str = ""


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class GroupMembersIn(BaseModel):
    user_ids: List[int]


class GroupCoursesIn(BaseModel):
    course_ids: List[int]


# === certificate ===
class CertificateOut(BaseModel):
    id: int
    user_id: int
    course_id: int
    code: str
    issued_at: datetime
    course_name: Optional[str] = None
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


# === category ===
class CategoryOut(BaseModel):
    id: int
    name: str
    slug: str

    class Config:
        from_attributes = True


class CategoryCreate(BaseModel):
    name: str


# === settings ===
class PortalSettings(BaseModel):
    site_name: str = "Napel LMS"
    site_description: str = ""
    primary_color: str = "#113C58"
    logo_url: Optional[str] = None


class GamificationSettings(BaseModel):
    enabled: bool = True
    login_points: int = 25
    unit_completion_points: int = 25
    course_completion_points: int = 150
    quiz_pass_points: int = 25
    quiz_perfect_bonus: int = 50
    level_up_points: int = 1000


# === quiz history ===
class QuizAttemptOut(BaseModel):
    id: int
    user_id: int
    unit_id: int
    attempt_number: int
    score_pct: int
    passed: bool
    started_at: datetime
    completed_at: Optional[datetime] = None
    course_id: Optional[int] = None
    course_name: Optional[str] = None
    unit_title: Optional[str] = None
    unit_section: Optional[str] = None

    class Config:
        from_attributes = True


# === learning paths ===
class LearningPathOut(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    description: str = ""
    category: str = "Geral"
    status: str = "active"
    sequential: bool = True
    icon: str = "route"
    courses_count: int = 0
    my_pct: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class LearningPathCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: str = ""
    category: str = "Geral"
    status: str = "active"
    sequential: bool = True
    icon: str = "route"


class LearningPathUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    sequential: Optional[bool] = None
    icon: Optional[str] = None


class LearningPathCoursesIn(BaseModel):
    course_ids: List[int]


class PathCertificateOut(BaseModel):
    id: int
    user_id: int
    path_id: int
    code: str
    issued_at: datetime
    path_name: Optional[str] = None
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


# resolve forward
TokenOut.model_rebuild()
