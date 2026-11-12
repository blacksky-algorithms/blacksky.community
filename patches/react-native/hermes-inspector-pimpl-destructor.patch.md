## HermesRuntimeAgentDelegate Patch - Destructor needs the complete Impl type

`HermesRuntimeAgentDelegate` holds a `std::unique_ptr<Impl>` to a class that is only
forward-declared in the header, and relies on the implicit destructor. Every translation unit
that includes the header then instantiates `std::default_delete<Impl>` where `Impl` is
incomplete, which newer libc++ rejects when React Native is compiled from source:

```
unique_ptr.h: error: invalid application of 'sizeof' to an incomplete type
'facebook::react::jsinspector_modern::HermesRuntimeAgentDelegate::Impl'
```

**The fix**: declare the destructor in the header and default it in the `.cpp`, where `Impl`
is complete.

Seen with Xcode 27.2 on React Native 0.88.1. Carried forward from the fork's 0.81.5 patch set.
