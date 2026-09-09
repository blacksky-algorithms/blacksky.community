// eslint-disable-next-line no-undef
var res = http.post('http://localhost:1986/' + SERVER_PATH, {
  headers: {'Content-Type': 'text/plain'},
  body: '',
})

if (res.status !== 200 || !res.body) {
  throw new Error(
    'Local E2E manager failed to create the requested fixture (status ' +
      res.status +
      ')',
  )
}

// eslint-disable-next-line no-undef
var payload
try {
  payload = json(res.body)
} catch (_error) {
  throw new Error('Local E2E manager returned an invalid fixture response')
}

if (!payload || !payload.appviewDid) {
  throw new Error('Local E2E manager returned an incomplete fixture response')
}

output.result = payload.appviewDid
if (payload.groupInvite) {
  output.groupInviteCode = payload.groupInvite.code
  output.groupInviteScenario = payload.groupInvite.scenario
  output.groupInviteServiceUrl = payload.groupInvite.acornUrl
}
