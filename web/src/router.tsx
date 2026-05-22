import {
  createRouter,
  createRootRoute,
  createRoute,
  redirect,
  Outlet,
} from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

// Eager — zero-wait paths every user hits on first load
import { LandingPage } from './apps/landing-page'
import { HomePage } from './apps/home-page'
import { LoginPage } from './apps/auth/login-page'
import { SignupPage } from './apps/auth/signup-page'
import { NotFoundPage } from './apps/not-found-page'
import { authClient } from './lib/auth-client'

// Lazy — everything else is split into separate chunks
const MarketplacePage = lazy(() => import('./apps/marketplace-page').then(m => ({ default: m.MarketplacePage })))
const CreatePage = lazy(() => import('./apps/create-page').then(m => ({ default: m.CreatePage })))
const EditPage = lazy(() => import('./apps/edit-page').then(m => ({ default: m.EditPage })))
const AppViewPage = lazy(() => import('./apps/app-view').then(m => ({ default: m.AppViewPage })))
const DashboardPage = lazy(() => import('./apps/dashboard-page').then(m => ({ default: m.DashboardPage })))
const UsagePage = lazy(() => import('./apps/usage-page').then(m => ({ default: m.UsagePage })))
const PaymentPage = lazy(() => import('./apps/payment-page').then(m => ({ default: m.PaymentPage })))
const AccountPage = lazy(() => import('./apps/account-page').then(m => ({ default: m.AccountPage })))
const AdminPage = lazy(() => import('./apps/admin-page').then(m => ({ default: m.AdminPage })))
const AdminSubmissionPage = lazy(() => import('./apps/admin-submission-page').then(m => ({ default: m.AdminSubmissionPage })))
const AdminAppsPage = lazy(() => import('./apps/admin-apps-page').then(m => ({ default: m.AdminAppsPage })))
const PrivacyPage = lazy(() => import('./apps/privacy-page').then(m => ({ default: m.PrivacyPage })))
const TermsPage = lazy(() => import('./apps/terms-page').then(m => ({ default: m.TermsPage })))
const RefundPage = lazy(() => import('./apps/refund-page').then(m => ({ default: m.RefundPage })))

const rootRoute = createRootRoute({
  component: () => (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  ),
  notFoundComponent: NotFoundPage,
})

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  beforeLoad: async ({ location }) => {
    const session = await authClient.getSession()
    if (!session?.data?.user) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: Outlet,
})

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
})

const homeRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/home',
  component: HomePage,
})

const marketplaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/marketplace',
  component: MarketplacePage,
})

const createRoute_ = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/create',
  component: CreatePage,
})

const appViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/apps/$appId',
  component: AppViewPage,
})

const editRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/apps/$appId/edit',
  component: EditPage,
})

const dashboardRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/dashboard',
  component: DashboardPage,
})

const usageRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/apps/$appId/usage',
  component: UsagePage,
})

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  component: SignupPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const paymentRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/payment',
  component: PaymentPage,
  validateSearch: (search: Record<string, unknown>) => ({
    billing: (search.billing === 'monthly' ? 'monthly' : 'annual') as 'monthly' | 'annual',
  }),
})

const accountRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/account',
  component: AccountPage,
})

const adminRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/admin',
  component: AdminPage,
})

const adminSubmissionRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/admin/submissions/$submissionId',
  component: AdminSubmissionPage,
})

const adminAppsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/admin/apps',
  component: AdminAppsPage,
})

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy',
  component: PrivacyPage,
})

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terms',
  component: TermsPage,
})

const refundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/refund',
  component: RefundPage,
})

const routeTree = rootRoute.addChildren([
  landingRoute,
  protectedRoute.addChildren([
    homeRoute,
    createRoute_,
    editRoute,
    dashboardRoute,
    usageRoute,
    paymentRoute,
    accountRoute,
    adminRoute,
    adminSubmissionRoute,
    adminAppsRoute,
  ]),
  marketplaceRoute,
  appViewRoute,
  signupRoute,
  loginRoute,
  privacyRoute,
  termsRoute,
  refundRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
