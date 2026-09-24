import axios from 'axios'
import toast from 'react-hot-toast'

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  withCredentials: true, // send cookies (JWT) with every request
})

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const isSessionCheck = url.includes('/user-api/me')

    // The silent "am I logged in?" check should never show an error toast
    if (!isSessionCheck) {
      const message = error.response?.data?.message || 'Something went wrong'
      toast.error(message)
    }
    return Promise.reject(error)
  }
)

export default axiosInstance
