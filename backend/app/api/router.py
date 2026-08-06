from fastapi import APIRouter
from app.api import auth, users, tickets, comments, history, dashboard, sectors, chat, attachments

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(tickets.router, prefix="/tickets", tags=["Tickets"])
api_router.include_router(comments.router, prefix="/tickets", tags=["Comments"])
api_router.include_router(history.router, prefix="/tickets", tags=["History"])
api_router.include_router(chat.router, prefix="/tickets", tags=["Chat"])
api_router.include_router(attachments.router, prefix="/tickets", tags=["Attachments"])
api_router.include_router(sectors.router, prefix="/sectors", tags=["Sectors"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
