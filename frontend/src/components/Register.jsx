import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, Link, Navigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore.js'
import AuthLayout from './AuthLayout.jsx'

const roles = [
  { value: 'customer', title: 'Customer', desc: 'I need services' },
  { value: 'provider', title: 'Provider', desc: 'I offer services' },
]

export default function Register() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { role: 'customer' } })
  const doRegister = useAuthStore((s) => s.register)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const selectedRole = watch('role')

  if (user) return <Navigate to="/dashboard" replace />

  const onSubmit = async (data) => {
    try {
      await doRegister(data)
      toast.success('Account created!')
      navigate('/dashboard')
    } catch {
      // handled by interceptor
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join CareConnect in less than a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {/* Role selector */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">I am a</span>
          <div className="grid grid-cols-2 gap-3">
            {roles.map((r) => (
              <label
                key={r.value}
                className={`cursor-pointer rounded-xl border p-3 transition ${
                  selectedRole === r.value
                    ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/20'
                    : 'border-slate-300 bg-white hover:border-slate-400'
                }`}
              >
                <input type="radio" value={r.value} className="sr-only" {...register('role')} />
                <p className={`text-sm font-semibold ${selectedRole === r.value ? 'text-brand-800' : 'text-slate-800'}`}>
                  {r.title}
                </p>
                <p className="text-xs text-slate-500">{r.desc}</p>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-700">
            Full name
          </label>
          <input
            id="name"
            autoComplete="name"
            placeholder="Your full name"
            className={`input-field ${errors.name ? 'has-error' : ''}`}
            {...register('name', { required: 'Full name is required' })}
          />
          {errors.name && <p className="mt-1.5 text-xs text-red-600">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className={`input-field ${errors.email ? 'has-error' : ''}`}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
            })}
          />
          {errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-slate-700">
            Phone <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            className="input-field"
            {...register('phone')}
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              className={`input-field pr-16 ${errors.password ? 'has-error' : ''}`}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 6, message: 'Password must be at least 6 characters' },
              })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-3 my-auto h-fit text-xs font-semibold text-slate-500 hover:text-brand-700"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {errors.password && <p className="mt-1.5 text-xs text-red-600">{errors.password.message}</p>}
        </div>

        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
