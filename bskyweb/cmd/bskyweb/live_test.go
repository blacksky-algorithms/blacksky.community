package main

import (
	"testing"

	appbsky "github.com/bluesky-social/indigo/api/bsky"
)

func TestLiveStreamTitle(t *testing.T) {
	active, inactive := true, false
	view := func(status string, isActive *bool) *appbsky.ActorDefs_ProfileViewDetailed {
		return &appbsky.ActorDefs_ProfileViewDetailed{Status: &appbsky.ActorDefs_StatusView{
			Status:   status,
			IsActive: isActive,
			Embed: &appbsky.ActorDefs_StatusView_Embed{EmbedExternal_View: &appbsky.EmbedExternal_View{
				External: &appbsky.EmbedExternal_ViewExternal{Title: "Off Protocol LIVE"},
			}},
		}}
	}
	cases := []struct {
		name string
		pv   *appbsky.ActorDefs_ProfileViewDetailed
		want string
	}{
		{"active", view("app.bsky.actor.status#live", &active), "Off Protocol LIVE"},
		{"no expiry", view("app.bsky.actor.status#live", nil), "Off Protocol LIVE"},
		{"expired", view("app.bsky.actor.status#live", &inactive), ""},
		{"other status", view("app.bsky.actor.status#other", &active), ""},
		{"no status", &appbsky.ActorDefs_ProfileViewDetailed{}, ""},
	}
	for _, c := range cases {
		if got := liveStreamTitle(c.pv); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
