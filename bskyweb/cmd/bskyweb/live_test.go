package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

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

func TestLiveImageFallbacks(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
	}))
	defer ok.Close()
	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer broken.Close()
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
	}))
	defer slow.Close()

	client := &http.Client{Timeout: 50 * time.Millisecond}
	active := true
	thumb, banner := "https://cdn.example/thumb.jpg", "https://cdn.example/banner.jpg"
	live := &appbsky.ActorDefs_ProfileViewDetailed{
		Banner: &banner,
		Status: &appbsky.ActorDefs_StatusView{
			Status:   "app.bsky.actor.status#live",
			IsActive: &active,
			Embed: &appbsky.ActorDefs_StatusView_Embed{EmbedExternal_View: &appbsky.EmbedExternal_View{
				External: &appbsky.EmbedExternal_ViewExternal{Thumb: &thumb},
			}},
		},
	}
	cases := []struct {
		name    string
		pv      *appbsky.ActorDefs_ProfileViewDetailed
		cardURL string
		want    string
	}{
		{"card ok", live, ok.URL, ok.URL},
		{"card error uses status thumb", live, broken.URL, thumb},
		{"card timeout uses status thumb", live, slow.URL, thumb},
		{"no status uses banner", &appbsky.ActorDefs_ProfileViewDetailed{Banner: &banner}, broken.URL, banner},
		{"nothing uses default", &appbsky.ActorDefs_ProfileViewDetailed{}, broken.URL, "https://static/default.png"},
	}
	for _, c := range cases {
		if got := liveImage(context.Background(), client, c.pv, c.cardURL, "https://static/default.png"); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
