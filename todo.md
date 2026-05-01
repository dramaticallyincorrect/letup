# idea

user created apps

## requirements
1. once the widget is built if the widget is edited a copy of the widget and it's data should be kept to allow the user to rollback




# round 5 - infra

1. signing
   1. sign in
   2. sign up
2. payment
3. credit limits


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