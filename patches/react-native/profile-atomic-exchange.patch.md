## RCTProfile.m Patch - Bitwise atomic operations on an `atomic_bool`

`RCTProfileProfiling` is an `atomic_bool`, and the file sets and clears it with
`atomic_fetch_or` and `atomic_fetch_and`. C11 does not define the bitwise fetch operations
for `atomic_bool`, and newer Clang rejects them.

**The fix**: `atomic_exchange`, which stores the new value and returns the previous one, the
same result the bitwise forms produced for a flag.

Carried forward from the fork's 0.81.5 patch set.
