"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, User, Trophy, RotateCcw, Loader2 } from "lucide-react"

// 音節リストを2行ずつまとめて整理
const SYLLABLE_ROWS = [
  {
    groups: [{ syllables: ["あ", "い", "う", "え", "お"] }, { syllables: ["か", "き", "く", "け", "こ"] }],
  },
  {
    groups: [{ syllables: ["さ", "し", "す", "せ", "そ"] }, { syllables: ["た", "ち", "つ", "て", "と"] }],
  },
  {
    groups: [{ syllables: ["な", "に", "ぬ", "ね", "の"] }, { syllables: ["は", "ひ", "ふ", "へ", "ほ"] }],
  },
  {
    groups: [{ syllables: ["ま", "み", "む", "め", "も"] }, { syllables: ["や", "ゆ", "よ"] }],
  },
  {
    groups: [{ syllables: ["ら", "り", "る", "れ", "ろ"] }, { syllables: ["わ", "を", "ん"] }],
  },
  {
    groups: [{ syllables: ["が", "ぎ", "ぐ", "げ", "ご"] }, { syllables: ["ざ", "じ", "ず", "ぜ", "ぞ"] }],
  },
  {
    groups: [{ syllables: ["だ", "ぢ", "づ", "で", "ど"] }, { syllables: ["ば", "び", "ぶ", "べ", "ぼ"] }],
  },
  {
    groups: [{ syllables: ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"] }, { syllables: ["きゃ", "きゅ", "きょ"] }],
  },
  {
    groups: [{ syllables: ["しゃ", "しゅ", "しょ"] }, { syllables: ["ちゃ", "ちゅ", "ちょ"] }],
  },
  {
    groups: [{ syllables: ["にゃ", "にゅ", "にょ"] }, { syllables: ["ひゃ", "ひゅ", "ひょ"] }],
  },
  {
    groups: [{ syllables: ["みゃ", "みゅ", "みょ"] }, { syllables: ["りゃ", "りゅ", "りょ"] }],
  },
  {
    groups: [{ syllables: ["ぎゃ", "ぎゅ", "ぎょ"] }, { syllables: ["じゃ", "じゅ", "じょ"] }],
  },
  {
    groups: [{ syllables: ["びゃ", "びゅ", "びょ"] }, { syllables: ["ぴゃ", "ぴゅ", "ぴょ"] }],
  },
  {
    groups: [{ syllables: ["っ", "ー"] }],
  },
]

// 全音節のフラット配列（既存の機能との互換性のため）
const SYLLABLES = SYLLABLE_ROWS.flatMap((row) => row.groups.flatMap((group) => group.syllables))

type GameState = "waiting" | "playing" | "finished"
type Player = 1 | 2

interface GameData {
  currentPlayer: Player
  player1Syllables: Set<string>
  player2Syllables: Set<string>
  usedWords: string[]
  lastWord: string
  timeLeft: number
  gameState: GameState
  winner: Player | null
  errorMessage: string
}

interface WordValidationResult {
  isValid: boolean
  reason: string
  tokens: Array<{
    surface: string
    reading: string
    baseForm: string
    partOfSpeech: string
  }>
  hasNoun: boolean
  isSingleWord: boolean
}

// 最終音節取得ヘルパー
const getEffectiveLastSyllable = (syllables: string[]): string => {
  if (syllables.length === 0) return ""
  const last = syllables[syllables.length - 1]
  if ((last === "っ" || last === "ー") && syllables.length >= 2) {
    return syllables[syllables.length - 2]
  }
  return last
}

export default function Component() {
  const [gameData, setGameData] = useState<GameData>({
    currentPlayer: 1,
    player1Syllables: new Set(SYLLABLES),
    player2Syllables: new Set(SYLLABLES),
    usedWords: [],
    lastWord: "しりとり",
    timeLeft: 30,
    gameState: "waiting",
    winner: null,
    errorMessage: "",
  })

  const [inputWord, setInputWord] = useState("")
  const [validationState, setValidationState] = useState<{ valid: boolean; error: string; warning: string }>({
    valid: false,
    error: "",
    warning: "",
  })
  const [isValidatingWord, setIsValidatingWord] = useState(false)
  const [wordValidationCache, setWordValidationCache] = useState<Map<string, WordValidationResult>>(new Map())

  // タイマー機能
  useEffect(() => {
    if (gameData.gameState === "playing" && gameData.timeLeft > 0) {
      const timer = setTimeout(() => {
        setGameData((prev) => ({ ...prev, timeLeft: prev.timeLeft - 1 }))
      }, 1000)
      return () => clearTimeout(timer)
    } else if (gameData.gameState === "playing" && gameData.timeLeft === 0) {
      const winner = gameData.currentPlayer === 1 ? 2 : 1
      setGameData((prev) => ({
        ...prev,
        gameState: "finished",
        winner,
        errorMessage: `プレイヤー${gameData.currentPlayer}の時間切れです！`,
      }))
    }
  }, [gameData.gameState, gameData.timeLeft, gameData.currentPlayer])

  // 単語を音節に分解する関数
  const splitToSyllables = useCallback((word: string): string[] => {
    const syllables: string[] = []
    let i = 0

    while (i < word.length) {
      // 2文字の拗音をチェック
      if (i < word.length - 1) {
        const two = word.slice(i, i + 2)
        if (SYLLABLES.includes(two)) {
          syllables.push(two)
          i += 2
          continue
        }
      }
      const one = word[i]
      if (SYLLABLES.includes(one)) {
        syllables.push(one)
      }
      i++
    }
    return syllables
  }, [])

  // Yahoo APIで単語を検証
  const validateWordWithAPI = useCallback(
    async (word: string): Promise<WordValidationResult> => {
      // キャッシュをチェック
      if (wordValidationCache.has(word)) {
        return wordValidationCache.get(word)!
      }

      try {
        const response = await fetch("/api/validate-word", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ word }),
        })

        if (!response.ok) {
          throw new Error("API request failed")
        }

        const result: WordValidationResult = await response.json()

        // 結果をキャッシュ
        setWordValidationCache((prev) => new Map(prev).set(word, result))

        return result
      } catch (error) {
        console.error("Word validation error:", error)
        // エラーの場合はデフォルトで有効とする
        const fallbackResult: WordValidationResult = {
          isValid: true,
          reason: "API検証に失敗しました（単語は有効として扱われます）",
          tokens: [],
          hasNoun: false,
          isSingleWord: true,
        }
        return fallbackResult
      }
    },
    [wordValidationCache],
  )

  // 単語の検証
  const validateWord = useCallback(
    async (word: string): Promise<{ valid: boolean; error: string }> => {
      // 最優先：使用済み音節チェック
      const syllables = splitToSyllables(word)
      const playerBank = gameData.currentPlayer === 1 ? gameData.player1Syllables : gameData.player2Syllables
      const toRemove = syllables.slice(1)
      for (const s of toRemove) {
        if (!playerBank.has(s)) {
          return { valid: false, error: `音節「${s}」は既に使用済みです` }
        }
      }

      // その他のチェック
      if (word.length < 4) {
        return { valid: false, error: "4文字以上の単語を入力してください" }
      }
      if (gameData.usedWords.includes(word)) {
        return { valid: false, error: "この単語は既に使用されています" }
      }

      if (syllables.length < 3) {
        return { valid: false, error: "3音節以上の単語を入力してください" }
      }

      // 2文字目以降で同じ音節の重複チェック
      const syllablesFromSecond = syllables.slice(1)
      const uniqueSyllables = new Set(syllablesFromSecond)
      if (syllablesFromSecond.length !== uniqueSyllables.size) {
        return { valid: false, error: "2文字目以降で同じ音節を複数回使うことはできません" }
      }

      // 「ん」で始まる単語は不可
      if (syllables[0] === "ん") {
        return { valid: false, error: "「ん」で始まる単語は使用できません" }
      }

      // 最終音節が「ん」の場合は敗北
      const effectiveLast = getEffectiveLastSyllable(syllables)
      if (effectiveLast === "ん") {
        return { valid: false, error: "「ん」で終わる単語を使うと敗北です" }
      }

      if (gameData.lastWord) {
        const lastSyllables = splitToSyllables(gameData.lastWord)
        const lastEffective = getEffectiveLastSyllable(lastSyllables)
        if (syllables[0] !== lastEffective) {
          return { valid: false, error: `「${lastEffective}」で始まる単語を入力してください` }
        }
      }

      // Yahoo APIで日本語として有効かチェック
      const apiResult = await validateWordWithAPI(word)
      if (!apiResult.isValid) {
        return { valid: false, error: `${apiResult.reason}` }
      }

      return { valid: true, error: "" }
    },
    [gameData, splitToSyllables, validateWordWithAPI],
  )

  // リアルタイム検証（デバウンス付き）
  useEffect(() => {
    if (gameData.gameState !== "playing" || !inputWord.trim()) {
      setValidationState({ valid: false, error: "", warning: "" })
      return
    }

    const timeoutId = setTimeout(async () => {
      setIsValidatingWord(true)
      try {
        const validation = await validateWord(inputWord)
        if (!validation.valid) {
          setValidationState({ valid: false, error: validation.error, warning: "" })
        } else {
          setValidationState({ valid: true, error: "", warning: "この単語は使用可能です" })
        }
      } catch (error) {
        setValidationState({ valid: false, error: "検証中にエラーが発生しました", warning: "" })
      } finally {
        setIsValidatingWord(false)
      }
    }, 500) // 500ms のデバウンス

    return () => clearTimeout(timeoutId)
  }, [inputWord, validateWord, gameData.gameState])

  // 単語を提出
  const submitWord = useCallback(async () => {
    setIsValidatingWord(true)
    try {
      const validation = await validateWord(inputWord)
      if (!validation.valid) {
        if (validation.error.includes("敗北")) {
          const winner = gameData.currentPlayer === 1 ? 2 : 1
          setGameData((prev) => ({ ...prev, gameState: "finished", winner, errorMessage: validation.error }))
        } else {
          setGameData((prev) => ({ ...prev, errorMessage: validation.error }))
        }
        return
      }

      const syllables = splitToSyllables(inputWord)
      const toRemove = syllables.slice(1)
      setGameData((prev) => {
        const p1 = new Set(prev.player1Syllables)
        const p2 = new Set(prev.player2Syllables)
        if (prev.currentPlayer === 1) {
          toRemove.forEach((s) => p1.delete(s))
        } else {
          toRemove.forEach((s) => p2.delete(s))
        }
        const win1 = p1.size === 0
        const win2 = p2.size === 0
        if (win1 || win2) {
          return {
            ...prev,
            player1Syllables: p1,
            player2Syllables: p2,
            usedWords: [...prev.usedWords, inputWord],
            lastWord: inputWord,
            gameState: "finished",
            winner: win1 ? 1 : 2,
            errorMessage: "",
          }
        }
        return {
          ...prev,
          currentPlayer: prev.currentPlayer === 1 ? 2 : 1,
          player1Syllables: p1,
          player2Syllables: p2,
          usedWords: [...prev.usedWords, inputWord],
          lastWord: inputWord,
          timeLeft: 60,
          errorMessage: "",
        }
      })
      setInputWord("")
    } finally {
      setIsValidatingWord(false)
    }
  }, [inputWord, validateWord, splitToSyllables, gameData.currentPlayer])

  // ゲーム開始
  const startGame = () => {
    setGameData({
      currentPlayer: 1,
      player1Syllables: new Set(SYLLABLES),
      player2Syllables: new Set(SYLLABLES),
      usedWords: [],
      lastWord: "しりとり",
      timeLeft: 60,
      gameState: "playing",
      winner: null,
      errorMessage: "",
    })
    setInputWord("")
  }

  // リセット
  const resetGame = () => {
    setGameData({
      currentPlayer: 1,
      player1Syllables: new Set(SYLLABLES),
      player2Syllables: new Set(SYLLABLES),
      usedWords: [],
      lastWord: "しりとり",
      timeLeft: 30,
      gameState: "waiting",
      winner: null,
      errorMessage: "",
    })
    setInputWord("")
    setWordValidationCache(new Map())
  }

  // 最終音節取得
  const lastSyllable = gameData.lastWord ? getEffectiveLastSyllable(splitToSyllables(gameData.lastWord)) : ""

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">文字消ししりとり</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {gameData.gameState === "finished" ? (
              <>
                <Trophy className="h-5 w-5" />
                ゲーム終了
              </>
            ) : gameData.gameState === "playing" ? (
              <>
                <User className="h-5 w-5" />
                プレイヤー{gameData.currentPlayer}のターン
              </>
            ) : (
              "ゲーム待機中"
            )}
          </CardTitle>
          {gameData.gameState === "playing" && (
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              残り時間: {gameData.timeLeft}秒
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {gameData.gameState === "waiting" && (
            <Button onClick={startGame} size="lg">
              ゲーム開始
            </Button>
          )}
          {gameData.gameState === "playing" && (
            <div className="space-y-4">
              {gameData.lastWord && (
                <p>
                  前の単語: <strong>{gameData.lastWord}</strong>
                </p>
              )}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={inputWord}
                    onChange={(e) => setInputWord(e.target.value)}
                    placeholder={
                      lastSyllable ? `「${lastSyllable}」で始まる単語を入力` : "4文字以上の単語を入力してください"
                    }
                    onKeyPress={(e) => e.key === "Enter" && validationState.valid && !isValidatingWord && submitWord()}
                    className={
                      validationState.error ? "border-red-500" : validationState.valid ? "border-green-500" : ""
                    }
                    disabled={isValidatingWord}
                  />
                  <Button
                    onClick={submitWord}
                    disabled={!inputWord.trim() || !validationState.valid || isValidatingWord}
                  >
                    {isValidatingWord ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        検証中
                      </>
                    ) : (
                      "提出"
                    )}
                  </Button>
                </div>
                {/* リアルタイム検証結果表示 */}
                {inputWord.trim() && (
                  <div className="text-sm">
                    {isValidatingWord && <p className="text-blue-500">🔍 単語を検証中...</p>}
                    {!isValidatingWord && validationState.error && (
                      <p className="text-red-500">❌ {validationState.error}</p>
                    )}
                    {!isValidatingWord && validationState.warning && (
                      <p className="text-green-600">✅ {validationState.warning}</p>
                    )}
                  </div>
                )}
              </div>
              {gameData.errorMessage && <p className="text-red-500 text-sm">{gameData.errorMessage}</p>}
            </div>
          )}
          {gameData.gameState === "finished" && (
            <div className="text-center space-y-4">
              <div className="text-2xl font-bold text-green-600">プレイヤー{gameData.winner}の勝利！</div>
              {gameData.errorMessage && <p className="text-red-500">{gameData.errorMessage}</p>}
              <Button onClick={resetGame} className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                新しいゲーム
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              プレイヤー1の音節バンク<Badge variant="secondary">残り: {gameData.player1Syllables.size}個</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto font-mono">
              {SYLLABLE_ROWS.map((row, rowIndex) => (
                <div key={`p1-row-${rowIndex}`} className="flex gap-4">
                  {row.groups.map((group, groupIndex) => (
                    <div key={`p1-row-${rowIndex}-group-${groupIndex}`} className="flex gap-1">
                      {group.syllables.map((s) => (
                        <Badge
                          key={`p1-${s}`}
                          variant={gameData.player1Syllables.has(s) ? "default" : "secondary"}
                          className={`text-xs w-8 justify-center ${!gameData.player1Syllables.has(s) ? "opacity-30" : ""}`}
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              プレイヤー2の音節バンク<Badge variant="secondary">残り: {gameData.player2Syllables.size}個</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto font-mono">
              {SYLLABLE_ROWS.map((row, rowIndex) => (
                <div key={`p2-row-${rowIndex}`} className="flex gap-4">
                  {row.groups.map((group, groupIndex) => (
                    <div key={`p2-row-${rowIndex}-group-${groupIndex}`} className="flex gap-1">
                      {group.syllables.map((s) => (
                        <Badge
                          key={`p2-${s}`}
                          variant={gameData.player2Syllables.has(s) ? "default" : "secondary"}
                          className={`text-xs w-8 justify-center ${!gameData.player2Syllables.has(s) ? "opacity-30" : ""}`}
                        >
                          {s}
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      {gameData.usedWords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>使用済み単語</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {gameData.usedWords.map((w, i) => (
                <Badge key={i} variant="outline">
                  {w}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>ゲームルール</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ul className="list-disc list-inside space-y-1">
            <li>4文字以上の単語のみ使用可能</li>
            <li>前の単語の最後の音で始まる単語を入力</li>
            <li>単語の2文字目以降の音節が自分のバンクから削除される</li>
            <li>同じ単語は再利用不可</li>
            <li>「ん」で始まる単語は使用不可</li>
            <li>「ん」で終わる単語を使うと即敗北</li>
            <li>制限時間は各ターン60秒</li>
            <li>Yahoo! JAPAN APIで日本語として有効な単語かチェック</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
