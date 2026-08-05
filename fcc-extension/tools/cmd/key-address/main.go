package main

import (
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

func addressFromHex(raw string) (common.Address, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "0x")
	raw = strings.TrimPrefix(raw, "0X")
	key, err := crypto.HexToECDSA(raw)
	if err != nil {
		return common.Address{}, fmt.Errorf("invalid secp256k1 private key: %w", err)
	}
	return crypto.PubkeyToAddress(key.PublicKey), nil
}

func main() {
	raw, err := io.ReadAll(io.LimitReader(os.Stdin, 256))
	if err != nil {
		fmt.Fprintln(os.Stderr, "could not read private key")
		os.Exit(1)
	}
	address, err := addressFromHex(string(raw))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(address.Hex())
}
