from django.urls import path
from . import views
from .views import PostListView, PostDetailView, PostCreateView, PostUpdateView, PostDeleteView, ServiceWorkerView, OfflineView, WebAppManifestView


urlpatterns = [
    path('', PostListView.as_view(), name='blog-home'),
    path('post/<int:pk>/', PostDetailView.as_view(), name='post-detail'),
    path('post/new/', PostCreateView.as_view(), name='post-create'),
    path('post/<int:pk>/update/', PostUpdateView.as_view(), name='post-update'),
    path('post/<int:pk>/delete/', PostDeleteView.as_view(), name='post-delete'),
    path('about/', views.about, name='blog-about'),
    path('sw.js', ServiceWorkerView.as_view(), name='service-worker'),
    path('offline/', OfflineView.as_view(), name='offline'),
    path('manifest.json', WebAppManifestView.as_view(), name='manifest'),
]
