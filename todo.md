# round 1 - core

1. ~~add column~~
2. ~~add cards~~
   1. title
   2. description
3. ~~move cards~~


# round 2 - ai integration

1. run ai pipeline
   1. stream status/logs
2. column inputs
3. ai tools
   1. set data
   2. move card
   

# round 3 - custom renderer

1. set custom card renderer
   1. in column
   2. detail view


# round 4 - outer

1. boards list
2. templates


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