import { create } from 'zustand'
import axiosInstance from '../api/axiosInstance.js'

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,

  fetchNotifications: async () => {
    const res = await axiosInstance.get('/notification-api')
    set({ notifications: res.data.notifications, unreadCount: res.data.unreadCount })
    return res.data.notifications
  },
  markRead: async (id) => {
    await axiosInstance.put(`/notification-api/${id}/read`)
    set({
      notifications: get().notifications.map((n) => (n._id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, get().unreadCount - 1),
    })
  },
  markAllRead: async () => {
    await axiosInstance.put('/notification-api/read-all')
    set({
      notifications: get().notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })
  },
}))
