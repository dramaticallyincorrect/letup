import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { HomePage } from './apps/home-page'
import { CreatePage } from './apps/create-page'
import { WidgetViewPage } from './widgets/widget-view'

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const createRoute_ = createRoute({
  getParentRoute: () => rootRoute,
  path: '/create',
  component: CreatePage,
})

const appViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/apps/$appId',
  component: WidgetViewPage,
})

// Legacy redirects so old /widgets/* links don't 404
const widgetsRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/widgets',
  beforeLoad: () => { throw redirect({ to: '/' }) },
})

const widgetsNewRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/widgets/new',
  beforeLoad: () => { throw redirect({ to: '/create' }) },
})

const widgetsViewRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/widgets/$widgetId',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/apps/$appId', params: { appId: params.widgetId } })
  },
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  createRoute_,
  appViewRoute,
  widgetsRedirectRoute,
  widgetsNewRedirectRoute,
  widgetsViewRedirectRoute,
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
