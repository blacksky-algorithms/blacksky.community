# react-native-pager-view+6.8.0.patch

Adds support for iOS 26's `interactiveContentPopGestureRecognizer` (full-screen back gesture).

The pager already handles `RNSPanGestureRecognizer` (react-native-screens' custom full-screen gesture for pre-iOS 26) in `shouldRecognizeSimultaneouslyWithGestureRecognizer:`. It checks if the user is on the leftmost page and swiping right - if so, it disables the scrollview's pan gesture to let the back gesture through.

This patch adds the same logic for iOS 26's native `interactiveContentPopGestureRecognizer`, so the back gesture works on the leftmost page while the pager still handles swipes on other pages.

Related issues:
- https://github.com/software-mansion/react-native-screens/issues/3512
- https://github.com/software-mansion/react-native-screens/pull/3420

## Defer page changes while the user is swiping (old architecture)

`goTo:` (used by `setPage`) and `updateDataSource` call `setViewControllers` on the underlying `UIPageViewController`. If that happens while the user's swipe is still tracking, dragging or decelerating, it can collide with UIKit's own manual-scroll completion in `_UIQueuingScrollView` and abort the app (e.g. tapping a tab right after letting go of a swipe).

This patch stores the requested index (or a pending data-source update) while the scroll view is busy and applies it once the swipe settles: on `scrollViewDidEndDecelerating:` or `scrollViewDidEndDragging:willDecelerate:NO`, dispatched to the next main-queue turn, with a 100 ms retry while the user is still scrolling.
