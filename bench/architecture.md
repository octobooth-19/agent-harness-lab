# Benchmark architecture

```mermaid
flowchart TD
    K[Knowledge synthesis] --> C[Project coordinator]
    S[Benchmark skill] --> C
    C --> V[Versioned catalog]
    V --> P[Prepare engine]
    P --> M[Frozen manifest]
    P --> W[Isolated subject folder]
    C --> L[App session tools]
    L --> T[Fresh trial session]
    H[Optional headless adapter] --> T
    W --> T
    T --> E[Evidence collection]
    M --> E
    E --> J[Fresh judge session]
    J --> G[Validated grade]
    G --> R[Report and archive]
```

The trial and judge use different folders and sessions. The coordinator retains
the lab catalog and run records; the subject receives only its fixtures,
selected component configuration, and generated task prompt. Neither folder
separation nor a separate session is a security sandbox.
