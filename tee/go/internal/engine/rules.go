package engine

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strconv"
)

const maxDepth = 32

var intTokenRe = regexp.MustCompile(`^(0|[1-9][0-9]*)$`)

type intNode interface{ evalInt(draws []uint32) uint64 }
type boolNode interface{ evalBool(draws []uint32) bool }

type drawRef int

func (d drawRef) evalInt(draws []uint32) uint64 { return uint64(draws[d]) }

type constVal uint64

func (c constVal) evalInt([]uint32) uint64 { return uint64(c) }

type modNode struct {
	l intNode
	c uint64
}

func (m modNode) evalInt(draws []uint32) uint64 { return m.l.evalInt(draws) % m.c }

type cmpNode struct {
	op   string
	l, r intNode
}

func (c cmpNode) evalBool(draws []uint32) bool {
	l, r := c.l.evalInt(draws), c.r.evalInt(draws)
	switch c.op {
	case ">":
		return l > r
	case ">=":
		return l >= r
	case "<":
		return l < r
	case "<=":
		return l <= r
	case "==":
		return l == r
	default:
		return l != r
	}
}

type logicNode struct {
	and  bool
	args []boolNode
}

func (n logicNode) evalBool(draws []uint32) bool {
	for _, a := range n.args {
		if a.evalBool(draws) {
			if !n.and {
				return true
			}
		} else if n.and {
			return false
		}
	}
	return n.and
}

type notNode struct{ arg boolNode }

func (n notNode) evalBool(draws []uint32) bool { return !n.arg.evalBool(draws) }

type Rule struct {
	Min, Max  uint32
	Count     int
	PayoutBp  uint32
	win       boolNode
	Canonical []byte
	Hash      [32]byte
}

func ruleErr(reason string) error {
	return fmt.Errorf("invalid rule: %s", reason)
}

func objKeys(v map[string]any, keys ...string) bool {
	if len(v) != len(keys) {
		return false
	}
	for _, k := range keys {
		if _, ok := v[k]; !ok {
			return false
		}
	}
	return true
}

// FORESEER-SPEC §1.4
func asUint(v any, max uint64) (uint64, bool) {
	num, ok := v.(json.Number)
	if !ok || !intTokenRe.MatchString(num.String()) {
		return 0, false
	}
	u, err := strconv.ParseUint(num.String(), 10, 64)
	if err != nil || u > max {
		return 0, false
	}
	return u, true
}

func parseOperand(v any, count int, budget int) (intNode, error) {
	if budget < 1 {
		return nil, ruleErr("nesting too deep")
	}
	obj, ok := v.(map[string]any)
	if !ok || len(obj) != 1 {
		return nil, ruleErr("operand needs exactly one key")
	}
	if raw, ok := obj["r"]; ok {
		i, ok := asUint(raw, uint64(count-1))
		if !ok {
			return nil, ruleErr("draw index out of range")
		}
		return drawRef(i), nil
	}
	if raw, ok := obj["c"]; ok {
		c, ok := asUint(raw, uint32Max)
		if !ok {
			return nil, ruleErr("constant must be uint32")
		}
		return constVal(c), nil
	}
	return nil, ruleErr("operand key must be r or c")
}

func parseIntExpr(v any, count int, budget int) (intNode, error) {
	if budget < 1 {
		return nil, ruleErr("nesting too deep")
	}
	obj, ok := v.(map[string]any)
	if !ok {
		return nil, ruleErr("int expression must be an object")
	}
	if _, hasOp := obj["op"]; !hasOp {
		return parseOperand(v, count, budget)
	}
	if obj["op"] != "mod" {
		return nil, ruleErr("unknown int op")
	}
	if !objKeys(obj, "op", "l", "r") {
		return nil, ruleErr("mod needs exactly op, l, r")
	}
	l, err := parseOperand(obj["l"], count, budget-1)
	if err != nil {
		return nil, err
	}
	rObj, ok := obj["r"].(map[string]any)
	if !ok || !objKeys(rObj, "c") {
		return nil, ruleErr("mod divisor must be a constant >= 1")
	}
	c, okC := asUint(rObj["c"], uint32Max)
	if !okC || c == 0 {
		return nil, ruleErr("mod divisor must be a constant >= 1")
	}
	return modNode{l: l, c: c}, nil
}

var cmpOps = map[string]bool{">": true, ">=": true, "<": true, "<=": true, "==": true, "!=": true}

func parseBoolExpr(v any, count int, budget int) (boolNode, error) {
	if budget < 1 {
		return nil, ruleErr("nesting too deep")
	}
	obj, ok := v.(map[string]any)
	if !ok {
		return nil, ruleErr("bool expression needs an op")
	}
	op, ok := obj["op"].(string)
	if !ok {
		return nil, ruleErr("bool expression needs an op")
	}
	if cmpOps[op] {
		if !objKeys(obj, "op", "l", "r") {
			return nil, ruleErr("comparison needs exactly op, l, r")
		}
		l, err := parseIntExpr(obj["l"], count, budget-1)
		if err != nil {
			return nil, err
		}
		r, err := parseIntExpr(obj["r"], count, budget-1)
		if err != nil {
			return nil, err
		}
		return cmpNode{op: op, l: l, r: r}, nil
	}
	if op == "and" || op == "or" {
		if !objKeys(obj, "op", "args") {
			return nil, ruleErr("logic op needs exactly op, args")
		}
		args, ok := obj["args"].([]any)
		if !ok || len(args) < 2 {
			return nil, ruleErr("logic op needs >= 2 args")
		}
		nodes := make([]boolNode, 0, len(args))
		for _, a := range args {
			n, err := parseBoolExpr(a, count, budget-1)
			if err != nil {
				return nil, err
			}
			nodes = append(nodes, n)
		}
		return logicNode{and: op == "and", args: nodes}, nil
	}
	if op == "not" {
		if !objKeys(obj, "op", "arg") {
			return nil, ruleErr("not needs exactly op, arg")
		}
		arg, err := parseBoolExpr(obj["arg"], count, budget-1)
		if err != nil {
			return nil, err
		}
		return notNode{arg: arg}, nil
	}
	return nil, ruleErr("unknown op")
}

// FORESEER-SPEC §4.3
func canonical(v any, out *bytes.Buffer) error {
	switch t := v.(type) {
	case json.Number:
		if !intTokenRe.MatchString(t.String()) {
			return ruleErr("floats are forbidden")
		}
		out.WriteString(t.String())
	case string:
		out.WriteString(strconv.Quote(t))
	case []any:
		out.WriteByte('[')
		for i, item := range t {
			if i > 0 {
				out.WriteByte(',')
			}
			if err := canonical(item, out); err != nil {
				return err
			}
		}
		out.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		out.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				out.WriteByte(',')
			}
			out.WriteString(strconv.Quote(k))
			out.WriteByte(':')
			if err := canonical(t[k], out); err != nil {
				return err
			}
		}
		out.WriteByte('}')
	default:
		return ruleErr("only objects, arrays, strings, integers allowed")
	}
	return nil
}

const uint32Max = uint64(4294967295)

// FORESEER-SPEC §4
func ParseRule(raw []byte) (*Rule, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var doc any
	if err := dec.Decode(&doc); err != nil {
		return nil, ruleErr("not valid json")
	}
	if err := dec.Decode(new(any)); err != io.EOF {
		return nil, ruleErr("trailing content")
	}
	obj, ok := doc.(map[string]any)
	if !ok || !objKeys(obj, "v", "random", "win", "payout_bp") {
		return nil, ruleErr("rule needs exactly v, random, win, payout_bp")
	}
	if v, ok := asUint(obj["v"], 0); !ok || v != 0 {
		return nil, ruleErr("v must be 0")
	}
	random, ok := obj["random"].(map[string]any)
	if !ok || !objKeys(random, "type", "min", "max", "count") {
		return nil, ruleErr("random needs exactly type, min, max, count")
	}
	if random["type"] != "int" {
		return nil, ruleErr("random.type must be int")
	}
	minV, okMin := asUint(random["min"], uint32Max)
	maxV, okMax := asUint(random["max"], uint32Max)
	if !okMin || !okMax {
		return nil, ruleErr("min and max must be uint32")
	}
	if minV > maxV {
		return nil, ruleErr("min must be <= max")
	}
	count, okCount := asUint(random["count"], 16)
	if !okCount || count < 1 {
		return nil, ruleErr("count must be in 1..16")
	}
	payout, okPayout := asUint(obj["payout_bp"], uint32Max)
	if !okPayout {
		return nil, ruleErr("payout_bp must be uint32")
	}
	win, err := parseBoolExpr(obj["win"], int(count), maxDepth)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := canonical(doc, &buf); err != nil {
		return nil, err
	}
	rule := &Rule{
		Min:       uint32(minV),
		Max:       uint32(maxV),
		Count:     int(count),
		PayoutBp:  uint32(payout),
		win:       win,
		Canonical: buf.Bytes(),
		Hash:      sha256.Sum256(buf.Bytes()),
	}
	return rule, nil
}

// FORESEER-SPEC §4
func (r *Rule) EvalWin(draws []uint32) (bool, error) {
	if len(draws) != r.Count {
		return false, ruleErr("draw count mismatch")
	}
	return r.win.evalBool(draws), nil
}

type Outcome struct {
	Draws    []uint32
	Win      bool
	PayoutBp uint32
}

// FORESEER-SPEC §6.2
func ResolveOutcome(rule *Rule, serverSeed []byte, clientSeed string, nonce uint64) (*Outcome, error) {
	stream, err := NewByteStream(serverSeed, clientSeed, nonce)
	if err != nil {
		return nil, err
	}
	draws, err := DrawInts(stream, uint64(rule.Min), uint64(rule.Max), rule.Count)
	if err != nil {
		return nil, err
	}
	win, err := rule.EvalWin(draws)
	if err != nil {
		return nil, err
	}
	payout := uint32(0)
	if win {
		payout = rule.PayoutBp
	}
	return &Outcome{Draws: draws, Win: win, PayoutBp: payout}, nil
}
