package main

import "testing"

func TestAddressFromHexAcceptsOptionalPrefix(t *testing.T) {
	const key = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	const want = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

	for _, raw := range []string{key, "0x" + key, "0X" + key} {
		got, err := addressFromHex(raw)
		if err != nil {
			t.Fatalf("addressFromHex(%q): %v", raw[:2], err)
		}
		if got.Hex() != want {
			t.Fatalf("got %s, want %s", got.Hex(), want)
		}
	}
}

func TestAddressFromHexRejectsMalformedKey(t *testing.T) {
	for _, raw := range []string{"", "0x", "not-a-key", "01"} {
		if _, err := addressFromHex(raw); err == nil {
			t.Fatalf("addressFromHex(%q) unexpectedly succeeded", raw)
		}
	}
}
