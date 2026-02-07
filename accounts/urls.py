from django.urls import path 
from .views import *

urlpatterns = [
    path('', login_p, name='login'),
    path('signup/', signup, name='signup'),
    path('logout/', logout_p, name='logout'),
]
