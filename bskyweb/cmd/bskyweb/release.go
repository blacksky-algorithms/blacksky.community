package main

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

var releaseSHA = "development"
var releaseVersion = "development"

func releaseIdentity(c echo.Context) error {
	c.Response().Header().Set("Cache-Control", "no-store")
	return c.JSON(http.StatusOK, struct {
		SHA     string `json:"sha"`
		Version string `json:"version"`
	}{SHA: releaseSHA, Version: releaseVersion})
}
