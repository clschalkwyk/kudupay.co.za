# Python
from __future__ import annotations

from enum import Enum
from typing import Any, Callable, Dict, Optional, Type, TypeVar, Literal

from pydantic import BaseModel, EmailStr, Field, ValidationError


# 1) Event types
class EventType(str, Enum):
    USER_REGISTERED = "USER_REGISTERED"
    STUDENT_MAGIC_LINK_REQUESTED = "STUDENT_MAGIC_LINK_REQUESTED"
    # Add more event types here as needed:
    # USER_UPDATED = "USER_UPDATED"
    # PAYMENT_COMPLETED = "PAYMENT_COMPLETED"
    # ...


# 2) Shared/nested models
class Keys(BaseModel):
    Pk: str
    Sk: str


class UserRole(str, Enum):
    merchant = "merchant"
    student = "student"
    admin = "admin"
    sponsor = "sponsor"


class UserEnvelope(BaseModel):
    id: str
    email: EmailStr
    role: Optional[UserRole] = Field(default=None, description="User role if present")
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    studentNumber: Optional[str] = None
    is_active: Optional[bool] = None
    created_at: Optional[str] = None


# 3) Base envelope for all SQS messages (common fields)
class SqsMessageBase(BaseModel):
    eventType: EventType
    timestamp: str


# 4) Concrete event models
class UserRegisteredMessage(SqsMessageBase):
    # Pydantic v2: use Literal to enforce a constant field value
    eventType: Literal[EventType.USER_REGISTERED] = EventType.USER_REGISTERED
    user: UserEnvelope
    keys: Keys
    table: str
    source: str

class StudentMagicLinkRequestedMessage(SqsMessageBase):
    eventType: Literal[EventType.STUDENT_MAGIC_LINK_REQUESTED] = EventType.STUDENT_MAGIC_LINK_REQUESTED
    email: EmailStr
    magicToken: str
    linkUrl: Optional[str] = None
    source: Optional[str] = None


# 5) Registry and factory
T = TypeVar("T", bound=BaseModel)


class SqsModelRegistry:
    def __init__(self):
        self._registry: Dict[EventType, Type[BaseModel]] = {}

    def register(self, event: EventType) -> Callable[[Type[T]], Type[T]]:
        def _wrap(model_cls: Type[T]) -> Type[T]:
            self._registry[event] = model_cls
            return model_cls
        return _wrap

    def get_class(self, event: EventType) -> Optional[Type[BaseModel]]:
        return self._registry.get(event)

    def parse(self, data: Dict[str, Any]) -> BaseModel:
        if "eventType" not in data:
            raise ValueError("Missing 'eventType' in SQS message")
        try:
            event = EventType(data["eventType"])
        except Exception as e:
            raise ValueError(f"Unknown eventType: {data.get('eventType')}") from e

        model_cls = self.get_class(event)
        if model_cls is None:
            raise ValueError(f"No model registered for eventType '{event}'")
        try:
            # Pydantic v2: use model_validate
            return model_cls.model_validate(data)
        except ValidationError as ve:
            raise ValueError(f"Failed to parse SQS message as {model_cls.__name__}: {ve}") from ve


# 6) Instantiate registry and register models
sqs_registry = SqsModelRegistry()


@sqs_registry.register(EventType.USER_REGISTERED)
class _UserRegistered(UserRegisteredMessage):
    pass

@sqs_registry.register(EventType.STUDENT_MAGIC_LINK_REQUESTED)
class _StudentMagicLinkRequested(StudentMagicLinkRequestedMessage):
    pass


# 7) Public helpers
def get_sqs_model_class(message: Dict[str, Any]) -> Type[BaseModel]:
    if "eventType" not in message:
        raise ValueError("Missing 'eventType' in SQS message")
    try:
        event = EventType(message["eventType"])
    except Exception as e:
        raise ValueError(f"Unknown eventType: {message.get('eventType')}") from e

    model_cls = sqs_registry.get_class(event)
    if not model_cls:
        raise ValueError(f"No model registered for eventType '{event}'")
    return model_cls


def parse_sqs_message(message: Dict[str, Any]) -> BaseModel:
    return sqs_registry.parse(message)


# 8) Example usage
if __name__ == "__main__":
    message = {
        "eventType": "USER_REGISTERED",
        "timestamp": "2025-08-08T14:43:25.029Z",
        "user": {
            "id": "6508dd7a-beeb-4cfd-9c3e-8581d7ac401e-test111",
            "email": "clschalkwyk+coffee1test111@gmail.com",
            "role": "merchant",
            "firstName": "Wikus",
            "lastName": "Schalkwyk",
            "studentNumber": "N/A",
            "is_active": True,
            "created_at": "2025-08-08T14:43:24.944Z"
        },
        "keys": {
            "Pk": "MERCHANT#6508dd7a-beeb-4cfd-9c3e-8581d7ac401e",
            "Sk": "USER"
        },
        "table": "kudupay-prod-20250804",
        "source": "auth.registerUser"
    }

    # A) Get the class for this message
    cls = get_sqs_model_class(message)
    print("Resolved class:", cls.__name__)

    # B) Parse into a typed instance
    parsed = parse_sqs_message(message)
    print("Parsed eventType:", parsed.eventType)
    print("User ID:", parsed.user.id)
    print("Keys PK:", parsed.keys.Pk)