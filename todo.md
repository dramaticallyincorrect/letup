# idea

a marketplace for user created app

## round 1 - minimal core
1. list user widget
2. create widget page ui


## round 2 - create widget
1. create widget
   1. polished ui
   2. data access 
   3. agent access

## round 3 - market place

1. submit to review
2. list marketplace apps


## round 4 - approval dashboard
1. approve request
2. share in marketplace

## round 5 - infra

1. signing
   1. sign in
   2. sign up
2. payment

## round 6 - usage and payments
1. apps with ai usage
2. create apps usage
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