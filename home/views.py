from django.shortcuts import render
from accounts.models import Customer, AdminUser


def home(request):
    """Home page view - shows different content for users vs admins"""
    context = {}
    
    if request.user.is_authenticated:
        # Check if user is a customer
        if Customer.objects.filter(user=request.user).exists():
            context['user_type'] = 'customer'
        # Check if user is an admin
        elif AdminUser.objects.filter(user=request.user).exists():
            context['user_type'] = 'admin'
    
    return render(request, 'home/home.html', context)
