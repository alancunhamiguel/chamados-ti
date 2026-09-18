import enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    TECHNICIAN = "technician"
    EMPLOYEE = "employee"

    @classmethod
    def values(cls) -> list[str]:
        return [m.value for m in cls]


class TicketStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    WAITING = "waiting"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class OnlineStatus(str, enum.Enum):
    AVAILABLE = "disponivel"
    BUSY = "ocupado"
    IN_SERVICE = "em_atendimento"
    OFFLINE = "offline"