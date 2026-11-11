# react-native-worklets@0.13.0

## Missing standard-library includes

Several sources use `std::mutex`, `std::lock_guard`, `std::optional`, `std::chrono`,
`std::istream_iterator` and `<algorithm>` functions without including the headers that
declare them. They compiled only while another header pulled those in transitively, which
newer libc++ no longer does, so a from-source iOS build fails with errors such as:

```
WorkletRuntimeRegistry.h: error: no member named 'lock_guard' in namespace 'std'
WorkletsJSIUtils.cpp: error: no template named 'istream_iterator' in namespace 'std'
```

**The fix**: include what each file uses.

Seen with Xcode 27.2. Carried forward from the fork's 0.8.3 patch, with
`WorkletRuntimeRegistry.h` added.
