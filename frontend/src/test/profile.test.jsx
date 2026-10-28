import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = {
  user: { id: 3, username: 'sami', first_name: 'سامي', last_name: 'حسن', email: '', role_display: 'مشاهد' },
  isAuthenticated: true,
  isAdmin: false,
  permissions: ['search.view', 'water.view'],
  refresh: vi.fn(),
}
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
const toast = { success: vi.fn(), error: vi.fn() }
vi.mock('../context/ToastContext', () => ({ useToast: () => toast }))
vi.mock('../services/api', () => ({ authApi: { updateProfile: vi.fn(), changePassword: vi.fn(), setAvatar: vi.fn(), removeAvatar: vi.fn() } }))
// the browser can't draw pictures in the tests: the square is faked
vi.mock('../utils/resizeImage', () => ({ squareImage: vi.fn(async () => 'data:image/webp;base64,AAAA') }))

const { authApi } = await import('../services/api')
const { default: ProfilePage } = await import('../pages/ProfilePage')

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfilePage />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  authApi.updateProfile.mockResolvedValue({ user: auth.user })
  authApi.changePassword.mockResolvedValue({})
  authApi.setAvatar.mockResolvedValue({ avatar: '/api/avatars/3/?v=1' })
  authApi.removeAvatar.mockResolvedValue({})
  auth.user = { ...auth.user, avatar: null }
})

describe('ProfilePage («الملف الشخصي»)', () => {
  it('shows who is signed in and the pages open to them', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'الملف الشخصي' })).toBeInTheDocument()
    expect(screen.getByText('سامي حسن')).toBeInTheDocument()
    expect(screen.getByText('@sami')).toBeInTheDocument()
    const pages = screen.getByRole('region', { name: 'الصفحات المتاحة لك' })
    expect(within(pages).getByText('البحث عن المواقع')).toBeInTheDocument()
    expect(within(pages).getByText('جدول المياه')).toBeInTheDocument()
    expect(within(pages).queryByText('المستخدمون')).not.toBeInTheDocument()
  })

  it('saves the name and e-mail without a password', async () => {
    renderPage()
    const save = screen.getByRole('button', { name: /حفظ التغييرات/ })
    expect(save).toBeDisabled() // nothing changed yet
    await userEvent.clear(screen.getByLabelText('الاسم الأول'))
    await userEvent.type(screen.getByLabelText('الاسم الأول'), 'سمير')
    await userEvent.type(screen.getByLabelText('البريد الإلكتروني'), 'samir@example.com')
    await userEvent.click(save)
    expect(authApi.updateProfile).toHaveBeenCalledWith({ first_name: 'سمير', last_name: 'حسن', email: 'samir@example.com', username: 'sami' })
    expect(auth.refresh).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('تم حفظ بياناتك.')
  })

  it('a new username asks for the current password', async () => {
    renderPage()
    expect(screen.queryByLabelText('كلمة المرور الحالية', { selector: '#profile-current_password' })).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('اسم المستخدم (للدخول)'))
    await userEvent.type(screen.getByLabelText('اسم المستخدم (للدخول)'), 'samir')
    await userEvent.click(screen.getByRole('button', { name: /حفظ التغييرات/ }))
    expect(authApi.updateProfile).not.toHaveBeenCalled()
    expect(screen.getByText('أدخل كلمة المرور الحالية لتغيير اسم المستخدم.')).toBeInTheDocument()
    await userEvent.type(document.querySelector('#profile-current_password'), 'S3cure-Pass-2026')
    await userEvent.click(screen.getByRole('button', { name: /حفظ التغييرات/ }))
    expect(authApi.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ username: 'samir', current_password: 'S3cure-Pass-2026' }))
  })

  it('changes the password from the page', async () => {
    renderPage()
    const box = screen.getByRole('region', { name: 'كلمة المرور' })
    await userEvent.type(within(box).getByLabelText('كلمة المرور الحالية'), 'old-pass')
    await userEvent.type(within(box).getByLabelText('كلمة المرور الجديدة'), 'new-pass-1')
    await userEvent.type(within(box).getByLabelText('تأكيد كلمة المرور الجديدة'), 'new-pass-1')
    await userEvent.click(within(box).getByRole('button', { name: 'تغيير كلمة المرور' }))
    expect(authApi.changePassword).toHaveBeenCalledWith('old-pass', 'new-pass-1')
    expect(toast.success).toHaveBeenCalledWith('تم تغيير كلمة المرور بنجاح.')
  })

  it('adds a profile picture (cut to a small square first) and removes it', async () => {
    const { unmount } = renderPage()
    expect(screen.queryByRole('button', { name: 'إزالة الصورة' })).not.toBeInTheDocument()
    const file = new File(['x'], 'me.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText(/إضافة صورة/), file)
    expect(authApi.setAvatar).toHaveBeenCalledWith('data:image/webp;base64,AAAA')
    expect(auth.refresh).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('تم تحديث صورتك.')
    unmount()

    auth.user = { ...auth.user, avatar: '/api/avatars/3/?v=1' }
    renderPage()
    expect(document.querySelector('img[src="/api/avatars/3/?v=1"]')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'إزالة الصورة' }))
    expect(authApi.removeAvatar).toHaveBeenCalled()
  })
})
