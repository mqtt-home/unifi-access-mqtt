package config

import (
	"encoding/json"
	"os"

	"github.com/philipparndt/go-logger"
	"github.com/philipparndt/mqtt-gateway/config"
)

var cfg Config

type Config struct {
	MQTT     config.MQTTConfig `json:"mqtt"`
	UniFi    UniFiConfig       `json:"unifi"`
	LogLevel string            `json:"loglevel,omitempty"`
}

type UniFiConfig struct {
	Host      string          `json:"host"`
	Username  string          `json:"username"`
	Password  string          `json:"password"`
	VerifySSL *bool           `json:"verify-ssl,omitempty"`
	Doorbell  *DoorbellConfig `json:"doorbell,omitempty"`
}

// DoorbellConfig defines the devices to use for doorbell ring triggers
type DoorbellConfig struct {
	SourceReader  string   `json:"sourceReader"`  // Device ID or MAC of the reader (UA-G3, UA-G3-Pro)
	TargetViewers []string `json:"targetViewers"` // Device IDs or MACs of viewers to notify
}

func (u *UniFiConfig) GetVerifySSL() bool {
	if u.VerifySSL == nil {
		return false // Default to false for self-signed certificates
	}
	return *u.VerifySSL
}

func LoadConfig(file string) (Config, error) {
	data, err := os.ReadFile(file)
	if err != nil {
		logger.Error("Error reading config file", err)
		return Config{}, err
	}

	data = config.ReplaceEnvVariables(data)

	// Unmarshal the JSON data into the Config object
	err = json.Unmarshal(data, &cfg)
	if err != nil {
		logger.Error("Unmarshaling JSON:", err)
		return Config{}, err
	}

	// Set default values
	if cfg.LogLevel == "" {
		cfg.LogLevel = "info"
	}

	return cfg, nil
}

func Get() Config {
	return cfg
}
