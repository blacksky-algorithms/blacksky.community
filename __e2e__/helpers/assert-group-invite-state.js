var response = http.get('http://localhost:1986/__e2e/group-invite/state')

if (response.status !== 200 || !response.body) {
  throw new Error('Group invite fixture state was unavailable')
}

var state
try {
  state = json(response.body)
} catch (_error) {
  throw new Error('Group invite fixture state response was invalid')
}

function assertNumber(path, actual, expected) {
  if (expected === undefined || expected === '') return
  var parsed = Number(expected)
  if (actual !== parsed) {
    throw new Error(path + ' expected ' + parsed + ' but was ' + actual)
  }
}

assertNumber(
  'acceptRequests',
  state.acceptRequests,
  typeof EXPECT_ACCEPT_REQUESTS === 'undefined'
    ? undefined
    : EXPECT_ACCEPT_REQUESTS,
)
assertNumber(
  'acceptRequestsWithBearer',
  state.acceptRequestsWithBearer,
  typeof EXPECT_ACCEPT_WITH_BEARER === 'undefined'
    ? undefined
    : EXPECT_ACCEPT_WITH_BEARER,
)
assertNumber(
  'claimCount',
  state.claimCount,
  typeof EXPECT_CLAIM_COUNT === 'undefined' ? undefined : EXPECT_CLAIM_COUNT,
)
assertNumber(
  'claimantCount',
  state.claimantCount,
  typeof EXPECT_CLAIMANT_COUNT === 'undefined'
    ? undefined
    : EXPECT_CLAIMANT_COUNT,
)
assertNumber(
  'savedFeeds.total',
  state.savedFeeds.total,
  typeof EXPECT_SAVED_TOTAL === 'undefined' ? undefined : EXPECT_SAVED_TOTAL,
)
assertNumber(
  'savedFeeds.pinned',
  state.savedFeeds.pinned,
  typeof EXPECT_SAVED_PINNED === 'undefined' ? undefined : EXPECT_SAVED_PINNED,
)
assertNumber(
  'savedFeeds.visible',
  state.savedFeeds.visible,
  typeof EXPECT_SAVED_VISIBLE === 'undefined'
    ? undefined
    : EXPECT_SAVED_VISIBLE,
)
assertNumber(
  'savedFeeds.visiblePinned',
  state.savedFeeds.visiblePinned,
  typeof EXPECT_VISIBLE_PINNED === 'undefined'
    ? undefined
    : EXPECT_VISIBLE_PINNED,
)
assertNumber(
  'savedFeeds.inaccessible',
  state.savedFeeds.inaccessible,
  typeof EXPECT_INACCESSIBLE_SAVED === 'undefined'
    ? undefined
    : EXPECT_INACCESSIBLE_SAVED,
)

output.groupInviteStateChecked = true
