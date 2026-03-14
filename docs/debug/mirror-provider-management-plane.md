# Mirror Provider Management Plane

`src/mirror-provider/` now includes a Mirror-native provider management plane.

Purpose:

- make provider selection explicit
- make provider readiness and fallback state visible
- keep provider execution on one canonical runtime plane
- prepare policy, action-runtime, and operator-status hooks without redesigning the provider protocol

Current model:

- provider descriptors define the managed provider set
- provider plane tracks:
  - active provider
  - configured providers
  - ready providers
  - last error / last success
  - fallback availability
- runtime ingress still defaults to a single `primary` provider from:
  - `MIRROR_PROVIDER_URL`
  - `MIRROR_PROVIDER_AUTH_TOKEN`

Integration points:

- service boot creates a provider plane
- runtime host creates a provider plane
- gateway handlers execute through the provider plane
- runtime status surfaces expose provider state
- policy layer can evaluate provider handoff explicitly

Non-goals for this phase:

- no channel migration
- no provider marketplace
- no Mirror OS work
- no provider-specific UI rework
