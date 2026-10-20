# 開発とテスト

拡張機能はManifest V3の素のHTML/CSS/JavaScriptです。npm依存関係やビルド工程はありません。

## 構成

- `chrome-extension/content.js`：会話取得、自動読み上げ検知、会話ごとの設定
- `parser.js`・`auto-core.js`・`casting.js`：セリフ解析、重複防止、配役
- `background.js`：設定・通信の仲介、接続確認、再生ジョブ管理
- `player.js`：offscreen documentでの合成・出力機器指定・順次再生
- `character-panel.js`：画面右端のパネル
- `popup.*`：アドオンメニュー
- `audio-settings.*`・`*-settings.js`：設定・画像付き話者一覧・試聴
- `speakers.js`：標準の話者・スタイル一覧。稼働中のEngineから更新

## 必要なツール

Ubuntu、Python 3、GJS（`gjs`）、Google Chrome（`google-chrome`コマンド）。

```bash
sudo apt-get install gjs
python3 tests/run.py
python3 tests/browser.py
python3 tests/character-panel.py
```

GJSテストでは構文、解析、配役、再生制御、出力先の切り替え、コンテキスト無効化を確認します。Chromeテストは一時プロフィールとローカルHTMLを使い、ネットワークとVOICEVOXをモックします。パネルテストでは開閉、上下移動、設定保存、問い合わせ間隔、話者画像キャッシュの上限も確認します。

ChromeテストはローカルHTMLの検証のため `--no-sandbox` を指定します。実際のChatGPTページや利用者のプロフィールは開きません。

## 実機確認

1. 起動したVOICEVOXとChatGPTで、送信後に新しいセリフだけが読まれること。
2. 一時停止・再開・スキップ・キャンセルと、別タブへの影響。
3. パネルの名前・画像・位置保存・表示ON/OFF。
4. 指定機器への出音、切断・復帰、OS既定出力との分離。
5. メンバー一覧の画像・検索・スタイル選択・試聴。

モックテストの成功は、実際のChatGPTのDOMやBluetooth機器の出音を保証しません。
