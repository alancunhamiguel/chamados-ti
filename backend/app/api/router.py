from fastapi import APIRouter
from app.api import auth, users, tickets, comments, history, dashboard

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(tickets.router, prefix="/tickets", tags=["Tickets"])
api_router.include_router(comments.router, prefix="/tickets", tags=["Comments"])
api_router.include_router(history.router, prefix="/tickets", tags=["History"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
