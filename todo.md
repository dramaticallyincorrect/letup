# idea

a marketplace for user created app

## minimal core
1. create app
   1. ~~polished ui~~
   2. ~~chat history~~
   3. data access
   4. ~~agent access~~
   5. usage
      1. create apps usage
      2. apps with ai usage

## market place

1. submit to review
2. approve and publish

## Home Page
1. list apps
2. list market place
3. install from market place

## infra

1. signing
   1. sign in
   2. sign up
2. payment
3. add credit payment


# security consideration

1. not allowing ai to access destructive actions even if it calls the endpoint
   1. resource ids be uuid and always wrapped in closure that runs the mutation to not have the ai need the id.
   2. example: have a secret return to the client upon authentication, keep in memory, attach to request headers that are initiated by the user
2. http only authentication
3. custom renderers should not access to change the url
   1. CSP headers - search what we need
      1. form-action 'self'
      2. Maps-to 'self'
   2. inside ifram
   3. have the renderer code be served from another domain?