import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import apiClient, { clearAuthToken, setAuthToken } from '../lib/apiClient'
import { clearUserSession, loadUserSession, saveUserSession } from '../lib/storage'
import { getUserId } from '../lib/customerData'

const UserContext = createContext(null)

function normalizeUser(user) {
  if (!user) {
    return null
  }

  return {
    ...user,
    id: user.id || user.ma_nguoi_dung || user.sub || null,
    ma_nguoi_dung: user.ma_nguoi_dung || user.id || user.sub || null,
    full_name: user.full_name || user.ho_ten || user.hoTen || user.hoTen || user.tenDangNhap || user.email || '',
    phone: user.phone || user.so_dien_thoai || user.soDienThoai || '',
    avatar_url: user.avatar_url || user.avatarUrl || null,
    loyalty_points: Number(user.loyalty_points ?? user.diem_loyalty ?? 0),
    membership_tier: user.membership_tier || user.hang_thanh_vien?.ma_hang || user.hang_thanh_vien?.hang || 'MEMBER',
  }
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    ;(async () => {
      const session = await loadUserSession()
      if (session.user && session.token) {
        const nextUser = normalizeUser(session.user)
        setUser(nextUser)
        setToken(session.token)
        await setAuthToken(session.token)
      } else {
        await clearUserSession()
        await clearAuthToken()
      }
      setHydrated(true)
    })()
  }, [])

  const login = async ({ taiKhoan, matKhau, email }) => {
    const identifier = String(taiKhoan || email || '').trim()
    const password = String(matKhau || '').trim()

    console.log('🔐 API URL:', process.env.EXPO_PUBLIC_API_URL)
    console.log('📦 Body:', { tai_khoan: identifier, mat_khau: password })

    const response = await apiClient.post('/auth/login', {
      tai_khoan: identifier,
      mat_khau: password,
      email: identifier,
      password,
    })

    console.log('✅ Response:', JSON.stringify(response))

    const nextToken = response?.accessToken || response?.token || response?.data?.accessToken || response?.data?.token || ''
    const nextUser = normalizeUser(response?.user || response?.data?.user)

    if (!nextToken || !nextUser) {
      throw new Error('Backend login response missing accessToken or user')
    }

    setUser(nextUser)
    setToken(nextToken)
    await setAuthToken(nextToken)
    await saveUserSession(nextUser, nextToken)

    return nextUser
  }

  const updateSession = async (nextUser, nextToken = token) => {
    const normalizedUser = normalizeUser(nextUser)
    setUser(normalizedUser)

    if (nextToken) {
      setToken(nextToken)
      await setAuthToken(nextToken)
      await saveUserSession(normalizedUser, nextToken)
      return normalizedUser
    }

    await saveUserSession(normalizedUser, token)
    return normalizedUser
  }

  const refreshProfile = async () => {
    const userId = getUserId(user)
    if (!userId) {
      return null
    }

    const profile = await apiClient.get(`/users/${userId}/profile`)
    const loyalty = await apiClient.get(`/users/${userId}/loyalty`).catch(() => null)

    const nextUser = normalizeUser({
      ...user,
      ...profile,
      loyalty_points: loyalty?.diem ?? loyalty?.diem_hien_tai ?? user?.loyalty_points,
      membership_tier: loyalty?.hang_thanh_vien?.ma_hang || loyalty?.hang_thanh_vien?.hang || user?.membership_tier,
    })

    setUser(nextUser)
    await saveUserSession(nextUser, token)
    return nextUser
  }

  const logout = async () => {
    setUser(null)
    setToken(null)
    await clearAuthToken()
    await clearUserSession()
  }

  const value = useMemo(
    () => ({
      user,
      token,
      hydrated,
      login,
      updateSession,
      refreshProfile,
      logout,
    }),
    [hydrated, user, token],
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within UserProvider')
  }
  return context
}