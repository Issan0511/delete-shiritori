import { type NextRequest, NextResponse } from "next/server"
import kuromoji from "kuromoji"
import path from "path"

// KuromojiTokenizerのグローバルインスタンス
let tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null

// トークナイザーを初期化（一度だけ実行）
async function initTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  if (tokenizer) {
    return tokenizer
  }

  return new Promise((resolve, reject) => {
    const dicPath = path.join(process.cwd(), "public", "dict")
    kuromoji.builder({ dicPath }).build((err, _tokenizer) => {
      if (err) {
        console.error("Kuromoji initialization error:", err)
        reject(err)
      } else {
        tokenizer = _tokenizer
        console.log("Kuromoji tokenizer initialized successfully")
        resolve(_tokenizer)
      }
    })
  })
}

export async function POST(request: NextRequest) {
  try {
    const { word } = await request.json()

    if (!word) {
      return NextResponse.json({ error: "Word is required" }, { status: 400 })
    }

    console.log("Validating word:", word)

    // Kuromojiで形態素解析
    const tokenizerInstance = await initTokenizer()
    const tokens = tokenizerInstance.tokenize(word)

    console.log("Tokens:", tokens)

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
    const tokenInfo: Array<{
      surface: string
      reading: string
      baseForm: string
      partOfSpeech: string
    }> = []

    for (const token of tokens) {
      const pos = token.pos || "未知"
      
      tokenInfo.push({
        surface: token.surface_form,
        reading: token.reading || token.surface_form,
        baseForm: token.basic_form || token.surface_form,
        partOfSpeech: pos,
      })

      // 名詞、動詞、形容詞、副詞を有効とする
      if (
        pos.includes("名詞") ||
        pos.includes("動詞") ||
        pos.includes("形容詞") ||
        pos.includes("副詞")
      ) {
        hasValidParts = true
      }

      if (pos.includes("名詞")) {
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

    console.log("Validation result:", { isValid, reason, tokenInfo })

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
