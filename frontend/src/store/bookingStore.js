import { create } from 'zustand'
import axiosInstance from '../api/axiosInstance.js'

export const useBookingStore = create((set, get) => ({
  bookings: [],
  activeBooking: null,
  activeBookingInvoice: null,
  activeBookingReview: null,
  activeBookingCases: [],
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
    set({
      activeBooking: res.data.booking,
      activeBookingInvoice: res.data.invoice,
      activeBookingReview: res.data.review,
      activeBookingCases: res.data.cases || [],
    })
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
  rejectCompletion: async (id, reason) => {
    const res = await axiosInstance.put(`/booking-api/${id}/reject-completion`, { reason })
    set({ activeBooking: res.data.booking })
    return res.data.booking
  },
  cancelBooking: async (id, reason) => {
    const res = await axiosInstance.put(`/booking-api/${id}/cancel`, { reason })
    set({ activeBooking: res.data.booking })
    return res.data.booking
  },
  rescheduleBooking: async (id, payload) => {
    const res = await axiosInstance.put(`/booking-api/${id}/reschedule`, payload)
    set({ activeBooking: res.data.booking })
    return res.data.booking
  },
  reassignBooking: async (id, payload) => {
    const res = await axiosInstance.put(`/booking-api/${id}/reassign`, payload)
    set({ activeBooking: res.data.booking })
    return res.data.booking
  },

  /* ---------- reviews ---------- */
  submitReview: async (id, payload) => {
    const res = await axiosInstance.post(`/booking-api/${id}/review`, payload)
    set({ activeBookingReview: res.data.review })
    return res.data.review
  },
  editReview: async (id, payload) => {
    const res = await axiosInstance.put(`/booking-api/${id}/review`, payload)
    set({ activeBookingReview: res.data.review })
    return res.data.review
  },
  deleteReview: async (id) => {
    await axiosInstance.delete(`/booking-api/${id}/review`)
    set({ activeBookingReview: null })
  },
  replyToReview: async (id, text) => {
    const res = await axiosInstance.put(`/booking-api/${id}/review/reply`, { text })
    set({ activeBookingReview: res.data.review })
    return res.data.review
  },
}))
