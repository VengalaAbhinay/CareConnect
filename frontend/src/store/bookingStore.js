import { create } from 'zustand'
import axiosInstance from '../api/axiosInstance.js'

export const useBookingStore = create((set, get) => ({
  bookings: [],
  activeBooking: null,
  disputes: [],
  isLoading: false,

  fetchBookings: async (params = {}) => {
    set({ isLoading: true })
    try {
      const res = await axiosInstance.get('/booking-api', { params })
      set({ bookings: res.data.bookings })
      return res.data.bookings
    } finally {
      set({ isLoading: false })
    }
  },
  fetchBooking: async (id) => {
    const res = await axiosInstance.get(`/booking-api/${id}`)
    set({ activeBooking: res.data.booking })
    return res.data.booking
  },
  createBooking: async (payload) => {
    const res = await axiosInstance.post('/booking-api', payload)
    set({ bookings: [res.data.booking, ...get().bookings] })
    return res.data.booking
  },
  updateStatus: async (id, payload) => {
    const res = await axiosInstance.put(`/booking-api/${id}/status`, payload)
    set({ activeBooking: res.data.booking })
    return res.data.booking
  },
  confirmCompletion: async (id) => {
    const res = await axiosInstance.put(`/booking-api/${id}/confirm`)
    set({ activeBooking: res.data.booking })
    return res.data.booking
  },
  cancelBooking: async (id, reason) => {
    const res = await axiosInstance.put(`/booking-api/${id}/cancel`, { reason })
    set({ activeBooking: res.data.booking })
    return res.data.booking
  },
  submitReview: async (id, payload) => {
    const res = await axiosInstance.post(`/booking-api/${id}/review`, payload)
    return res.data.review
  },
  raiseDispute: async (id, reason) => {
    const res = await axiosInstance.post(`/booking-api/${id}/dispute`, { reason })
    return res.data.dispute
  },

  /* ---------- disputes (admin / ops / support) ---------- */
  fetchAllDisputes: async (params = {}) => {
    const res = await axiosInstance.get('/booking-api/disputes/all', { params })
    set({ disputes: res.data.disputes })
    return res.data.disputes
  },
  resolveDispute: async (id, payload) => {
    const res = await axiosInstance.put(`/booking-api/disputes/${id}`, payload)
    set({ disputes: get().disputes.map((d) => (d._id === id ? res.data.dispute : d)) })
    return res.data.dispute
  },
}))
