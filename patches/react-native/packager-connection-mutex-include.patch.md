## RCTPackagerConnection.mm Patch - Missing `<mutex>` include

The file uses `std::mutex` and `std::lock_guard` but never includes `<mutex>`. It compiled
only while another header pulled it in transitively, which newer libc++ no longer does:

```
RCTPackagerConnection.mm: error: no template named 'lock_guard' in namespace 'std'
```

**The fix**: include `<mutex>`.

Seen with Xcode 27.2 on React Native 0.88.1. Carried forward from the fork's 0.81.5 patch set.
