from pydantic import BaseModel, EmailStr, Field

class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class WaitlistOut(BaseModel):
    status: str = "waitlisted"
    position: int
