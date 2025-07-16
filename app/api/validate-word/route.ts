import { type NextRequest, NextResponse } from "next/server"

interface JishoResult {
  meta: {
    status: number
  }
  data: Array<{
    slug: string
    is_common: boolean
    japanese: Array<{
      word?: string
      reading?: string
    }>
    senses: Array<{
      parts_of_speech: string[]
    }>
  }>
}

interface WordValidationResult {
  isValid: boolean
  reason: string
  isExactMatch: boolean
  foundReading?: string
}

export async function POST(request: NextRequest) {
  try {
    const { word } = await request.json()

    if (!word) {
      return NextResponse.json({ error: "Word is required" }, { status: 400 })
    }

    console.log("=== Jisho API 単語検証 ===")
    console.log("検索単語:", word)

    // Jisho APIで検索
    const encodedWord = encodeURIComponent(word)
    const jishoUrl = `https://jisho.org/api/v1/search/words?keyword=${encodedWord}`
    
    console.log("Jisho API URL:", jishoUrl)

    const response = await fetch(jishoUrl)
    
    if (!response.ok) {
      console.log("Jisho API error:", response.status)
      return NextResponse.json({
        isValid: false,
        reason: "辞書APIへのアクセスに失敗しました",
        isExactMatch: false,
      })
    }

    const jishoData: JishoResult = await response.json()
    console.log("Jisho API response:", JSON.stringify(jishoData, null, 2))

    if (!jishoData.data || jishoData.data.length === 0) {
      return NextResponse.json({
        isValid: false,
        reason: "辞書に見つかりませんでした",
        isExactMatch: false,
      })
    }

    // 最初の結果を詳細に分析
    const firstResult = jishoData.data[0]
    console.log("第一検索結果:", firstResult)

    // 完全一致の判定（1番目の結果のreadingの文字数が一致するかチェック）
    let isExactMatch = false
    let foundReading = ""

    // japanese配列をチェック
    for (const japaneseEntry of firstResult.japanese) {
      const entryWord = japaneseEntry.word || ""
      const entryReading = japaneseEntry.reading || ""
      
      console.log("辞書エントリ - 単語:", entryWord, "読み:", entryReading)

      // 読みが完全一致するかチェック（文字数も一致）
      if (entryReading === word && entryReading.length === word.length) {
        isExactMatch = true
        foundReading = entryReading
        console.log("完全一致発見 (読み):", entryReading)
        break
      }

      // 単語が完全一致するかチェック
      if (entryWord === word && entryWord.length === word.length) {
        isExactMatch = true
        foundReading = entryReading
        console.log("完全一致発見 (単語):", entryWord)
        break
      }
    }

    // 品詞情報の確認
    const partsOfSpeech = firstResult.senses[0]?.parts_of_speech || []
    console.log("品詞:", partsOfSpeech)

    // 有効な品詞かチェック
    const validPOS = ["Noun", "Verb", "Adjective", "Adverb", "Interjection"]
    const hasValidPOS = partsOfSpeech.some(pos => validPOS.includes(pos))

    let reason = ""
    let isValid = false

    if (isExactMatch && hasValidPOS) {
      isValid = true
      reason = `辞書に登録された有効な単語です (${foundReading})`
    } else if (isExactMatch && !hasValidPOS) {
      isValid = false
      reason = `辞書にありますが、有効な品詞ではありません (${partsOfSpeech.join(", ")})`
    } else {
      isValid = false
      reason = "検索結果はありますが、完全一致しませんでした"
    }

    console.log("最終判定:", { isValid, reason, isExactMatch, foundReading })

    return NextResponse.json({
      isValid,
      reason,
      isExactMatch,
      foundReading,
    })

  } catch (error) {
    console.error("Word validation error:", error)
    return NextResponse.json(
      { 
        error: "Failed to validate word",
        isValid: false,
        reason: "検証中にエラーが発生しました",
        isExactMatch: false,
      }, 
      { status: 500 }
    )
  }
}
