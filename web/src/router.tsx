import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { HomePage } from './apps/home-page'
import { CreatePage } from './apps/create-page'
import { AppViewPage } from './apps/app-view'

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
  component: AppViewPage,
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  createRoute_,
  appViewRoute,
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
