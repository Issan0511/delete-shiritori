import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { word } = await request.json()

    if (!word) {
      return NextResponse.json({ error: "Word is required" }, { status: 400 })
    }

    // Yahoo! JAPAN 日本語形態素解析 API を呼び出し

    // 新コード
    const response = await fetch("https://jlp.yahooapis.jp/MAService/V2/parse", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Yahoo-AppID": "dj00aiZpPTRhczN3VENLUU54aCZzPWNvbnN1bWVyc2VjcmV0Jng9M2E-",
      },
      body: new URLSearchParams({
        sentence: word,
        results: "ma",
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(`API error: ${data.error.message}`)
    }

    // トークンを解析して名詞かどうか判断
    const tokens = data.ma_result?.word_list?.[0] || [];

    if (tokens.length === 0) {
      return NextResponse.json({
        isValid: false,
        reason: "認識できない単語です",
        tokens: [],
      })
    }

    // 全てのトークンをチェック
    let hasNoun = false
    let hasValidParts = false
    const tokenInfo = []

    for (const token of tokens) {
      const [surface, reading, baseForm, partOfSpeech] = token
      tokenInfo.push({
        surface,
        reading,
        baseForm,
        partOfSpeech,
      })

      // 名詞、動詞、形容詞、副詞を有効とする
      if (partOfSpeech === "名詞" || partOfSpeech === "動詞" || partOfSpeech === "形容詞" || partOfSpeech === "副詞") {
        hasValidParts = true
      }

      if (partOfSpeech === "名詞") {
        hasNoun = true
      }
    }

    // 単一の単語として認識されているかチェック
    const isSingleWord = tokens.length === 1

    let isValid = false
    let reason = ""

    if (!hasValidParts) {
      reason = "有効な品詞が含まれていません"
    } else if (!isSingleWord) {
      reason = "複数の単語が含まれています"
    } else {
      isValid = true
      reason = hasNoun ? "名詞として認識されました" : "有効な単語として認識されました"
    }

    return NextResponse.json({
      isValid,
      reason,
      tokens: tokenInfo,
      hasNoun,
      isSingleWord,
    })
  } catch (error) {
    console.error("Word validation error:", error)
    return NextResponse.json({ error: "Failed to validate word" }, { status: 500 })
  }
}
