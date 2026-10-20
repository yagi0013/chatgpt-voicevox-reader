// Bundled fallback from the local VOICEVOX roster; refreshed from /speakers.
(function (root) {
  const bundled = [
  {
    "name": "四国めたん",
    "styleName": "ノーマル",
    "styleId": 2,
    "styles": [
      {
        "name": "ノーマル",
        "id": 2
      },
      {
        "name": "あまあま",
        "id": 0
      },
      {
        "name": "ツンツン",
        "id": 6
      },
      {
        "name": "セクシー",
        "id": 4
      },
      {
        "name": "ささやき",
        "id": 36
      },
      {
        "name": "ヒソヒソ",
        "id": 37
      }
    ]
  },
  {
    "name": "ずんだもん",
    "styleName": "ノーマル",
    "styleId": 3,
    "styles": [
      {
        "name": "ノーマル",
        "id": 3
      },
      {
        "name": "あまあま",
        "id": 1
      },
      {
        "name": "ツンツン",
        "id": 7
      },
      {
        "name": "セクシー",
        "id": 5
      },
      {
        "name": "ささやき",
        "id": 22
      },
      {
        "name": "ヒソヒソ",
        "id": 38
      },
      {
        "name": "ヘロヘロ",
        "id": 75
      },
      {
        "name": "なみだめ",
        "id": 76
      }
    ]
  },
  {
    "name": "春日部つむぎ",
    "styleName": "ノーマル",
    "styleId": 8,
    "styles": [
      {
        "name": "ノーマル",
        "id": 8
      }
    ]
  },
  {
    "name": "雨晴はう",
    "styleName": "ノーマル",
    "styleId": 10,
    "styles": [
      {
        "name": "ノーマル",
        "id": 10
      }
    ]
  },
  {
    "name": "波音リツ",
    "styleName": "ノーマル",
    "styleId": 9,
    "styles": [
      {
        "name": "ノーマル",
        "id": 9
      },
      {
        "name": "クイーン",
        "id": 65
      }
    ]
  },
  {
    "name": "玄野武宏",
    "styleName": "ノーマル",
    "styleId": 11,
    "styles": [
      {
        "name": "ノーマル",
        "id": 11
      },
      {
        "name": "喜び",
        "id": 39
      },
      {
        "name": "ツンギレ",
        "id": 40
      },
      {
        "name": "悲しみ",
        "id": 41
      }
    ]
  },
  {
    "name": "白上虎太郎",
    "styleName": "ふつう",
    "styleId": 12,
    "styles": [
      {
        "name": "ふつう",
        "id": 12
      },
      {
        "name": "わーい",
        "id": 32
      },
      {
        "name": "びくびく",
        "id": 33
      },
      {
        "name": "おこ",
        "id": 34
      },
      {
        "name": "びえーん",
        "id": 35
      }
    ]
  },
  {
    "name": "青山龍星",
    "styleName": "ノーマル",
    "styleId": 13,
    "styles": [
      {
        "name": "ノーマル",
        "id": 13
      },
      {
        "name": "熱血",
        "id": 81
      },
      {
        "name": "不機嫌",
        "id": 82
      },
      {
        "name": "喜び",
        "id": 83
      },
      {
        "name": "しっとり",
        "id": 84
      },
      {
        "name": "かなしみ",
        "id": 85
      },
      {
        "name": "囁き",
        "id": 86
      }
    ]
  },
  {
    "name": "冥鳴ひまり",
    "styleName": "ノーマル",
    "styleId": 14,
    "styles": [
      {
        "name": "ノーマル",
        "id": 14
      }
    ]
  },
  {
    "name": "九州そら",
    "styleName": "ノーマル",
    "styleId": 16,
    "styles": [
      {
        "name": "ノーマル",
        "id": 16
      },
      {
        "name": "あまあま",
        "id": 15
      },
      {
        "name": "ツンツン",
        "id": 18
      },
      {
        "name": "セクシー",
        "id": 17
      },
      {
        "name": "ささやき",
        "id": 19
      }
    ]
  },
  {
    "name": "もち子さん",
    "styleName": "ノーマル",
    "styleId": 20,
    "styles": [
      {
        "name": "ノーマル",
        "id": 20
      },
      {
        "name": "セクシー／あん子",
        "id": 66
      },
      {
        "name": "泣き",
        "id": 77
      },
      {
        "name": "怒り",
        "id": 78
      },
      {
        "name": "喜び",
        "id": 79
      },
      {
        "name": "のんびり",
        "id": 80
      }
    ]
  },
  {
    "name": "剣崎雌雄",
    "styleName": "ノーマル",
    "styleId": 21,
    "styles": [
      {
        "name": "ノーマル",
        "id": 21
      }
    ]
  },
  {
    "name": "WhiteCUL",
    "styleName": "ノーマル",
    "styleId": 23,
    "styles": [
      {
        "name": "ノーマル",
        "id": 23
      },
      {
        "name": "たのしい",
        "id": 24
      },
      {
        "name": "かなしい",
        "id": 25
      },
      {
        "name": "びえーん",
        "id": 26
      }
    ]
  },
  {
    "name": "後鬼",
    "styleName": "人間ver.",
    "styleId": 27,
    "styles": [
      {
        "name": "人間ver.",
        "id": 27
      },
      {
        "name": "ぬいぐるみver.",
        "id": 28
      },
      {
        "name": "人間（怒り）ver.",
        "id": 87
      },
      {
        "name": "鬼ver.",
        "id": 88
      }
    ]
  },
  {
    "name": "No.7",
    "styleName": "ノーマル",
    "styleId": 29,
    "styles": [
      {
        "name": "ノーマル",
        "id": 29
      },
      {
        "name": "アナウンス",
        "id": 30
      },
      {
        "name": "読み聞かせ",
        "id": 31
      }
    ]
  },
  {
    "name": "ちび式じい",
    "styleName": "ノーマル",
    "styleId": 42,
    "styles": [
      {
        "name": "ノーマル",
        "id": 42
      }
    ]
  },
  {
    "name": "櫻歌ミコ",
    "styleName": "ノーマル",
    "styleId": 43,
    "styles": [
      {
        "name": "ノーマル",
        "id": 43
      },
      {
        "name": "第二形態",
        "id": 44
      },
      {
        "name": "ロリ",
        "id": 45
      }
    ]
  },
  {
    "name": "小夜/SAYO",
    "styleName": "ノーマル",
    "styleId": 46,
    "styles": [
      {
        "name": "ノーマル",
        "id": 46
      }
    ]
  },
  {
    "name": "ナースロボ＿タイプＴ",
    "styleName": "ノーマル",
    "styleId": 47,
    "styles": [
      {
        "name": "ノーマル",
        "id": 47
      },
      {
        "name": "楽々",
        "id": 48
      },
      {
        "name": "恐怖",
        "id": 49
      },
      {
        "name": "内緒話",
        "id": 50
      }
    ]
  },
  {
    "name": "†聖騎士 紅桜†",
    "styleName": "ノーマル",
    "styleId": 51,
    "styles": [
      {
        "name": "ノーマル",
        "id": 51
      }
    ]
  },
  {
    "name": "雀松朱司",
    "styleName": "ノーマル",
    "styleId": 52,
    "styles": [
      {
        "name": "ノーマル",
        "id": 52
      }
    ]
  },
  {
    "name": "麒ヶ島宗麟",
    "styleName": "ノーマル",
    "styleId": 53,
    "styles": [
      {
        "name": "ノーマル",
        "id": 53
      }
    ]
  },
  {
    "name": "春歌ナナ",
    "styleName": "ノーマル",
    "styleId": 54,
    "styles": [
      {
        "name": "ノーマル",
        "id": 54
      }
    ]
  },
  {
    "name": "猫使アル",
    "styleName": "ノーマル",
    "styleId": 55,
    "styles": [
      {
        "name": "ノーマル",
        "id": 55
      },
      {
        "name": "おちつき",
        "id": 56
      },
      {
        "name": "うきうき",
        "id": 57
      },
      {
        "name": "つよつよ",
        "id": 110
      },
      {
        "name": "へろへろ",
        "id": 111
      }
    ]
  },
  {
    "name": "猫使ビィ",
    "styleName": "ノーマル",
    "styleId": 58,
    "styles": [
      {
        "name": "ノーマル",
        "id": 58
      },
      {
        "name": "おちつき",
        "id": 59
      },
      {
        "name": "人見知り",
        "id": 60
      },
      {
        "name": "つよつよ",
        "id": 112
      }
    ]
  },
  {
    "name": "中国うさぎ",
    "styleName": "ノーマル",
    "styleId": 61,
    "styles": [
      {
        "name": "ノーマル",
        "id": 61
      },
      {
        "name": "おどろき",
        "id": 62
      },
      {
        "name": "こわがり",
        "id": 63
      },
      {
        "name": "へろへろ",
        "id": 64
      }
    ]
  },
  {
    "name": "栗田まろん",
    "styleName": "ノーマル",
    "styleId": 67,
    "styles": [
      {
        "name": "ノーマル",
        "id": 67
      }
    ]
  },
  {
    "name": "あいえるたん",
    "styleName": "ノーマル",
    "styleId": 68,
    "styles": [
      {
        "name": "ノーマル",
        "id": 68
      }
    ]
  },
  {
    "name": "満別花丸",
    "styleName": "ノーマル",
    "styleId": 69,
    "styles": [
      {
        "name": "ノーマル",
        "id": 69
      },
      {
        "name": "元気",
        "id": 70
      },
      {
        "name": "ささやき",
        "id": 71
      },
      {
        "name": "ぶりっ子",
        "id": 72
      },
      {
        "name": "ボーイ",
        "id": 73
      }
    ]
  },
  {
    "name": "琴詠ニア",
    "styleName": "ノーマル",
    "styleId": 74,
    "styles": [
      {
        "name": "ノーマル",
        "id": 74
      }
    ]
  },
  {
    "name": "Voidoll",
    "styleName": "ノーマル",
    "styleId": 89,
    "styles": [
      {
        "name": "ノーマル",
        "id": 89
      }
    ]
  },
  {
    "name": "ぞん子",
    "styleName": "ノーマル",
    "styleId": 90,
    "styles": [
      {
        "name": "ノーマル",
        "id": 90
      },
      {
        "name": "低血圧",
        "id": 91
      },
      {
        "name": "覚醒",
        "id": 92
      },
      {
        "name": "実況風",
        "id": 93
      }
    ]
  },
  {
    "name": "中部つるぎ",
    "styleName": "ノーマル",
    "styleId": 94,
    "styles": [
      {
        "name": "ノーマル",
        "id": 94
      },
      {
        "name": "怒り",
        "id": 95
      },
      {
        "name": "ヒソヒソ",
        "id": 96
      },
      {
        "name": "おどおど",
        "id": 97
      },
      {
        "name": "絶望と敗北",
        "id": 98
      }
    ]
  },
  {
    "name": "離途",
    "styleName": "ノーマル",
    "styleId": 99,
    "styles": [
      {
        "name": "ノーマル",
        "id": 99
      },
      {
        "name": "シリアス",
        "id": 101
      }
    ]
  },
  {
    "name": "黒沢冴白",
    "styleName": "ノーマル",
    "styleId": 100,
    "styles": [
      {
        "name": "ノーマル",
        "id": 100
      }
    ]
  },
  {
    "name": "ユーレイちゃん",
    "styleName": "ノーマル",
    "styleId": 102,
    "styles": [
      {
        "name": "ノーマル",
        "id": 102
      },
      {
        "name": "甘々",
        "id": 103
      },
      {
        "name": "哀しみ",
        "id": 104
      },
      {
        "name": "ささやき",
        "id": 105
      },
      {
        "name": "ツクモちゃん",
        "id": 106
      }
    ]
  },
  {
    "name": "東北ずん子",
    "styleName": "ノーマル",
    "styleId": 107,
    "styles": [
      {
        "name": "ノーマル",
        "id": 107
      }
    ]
  },
  {
    "name": "東北きりたん",
    "styleName": "ノーマル",
    "styleId": 108,
    "styles": [
      {
        "name": "ノーマル",
        "id": 108
      }
    ]
  },
  {
    "name": "東北イタコ",
    "styleName": "ノーマル",
    "styleId": 109,
    "styles": [
      {
        "name": "ノーマル",
        "id": 109
      }
    ]
  },
  {
    "name": "あんこもん",
    "styleName": "ノーマル",
    "styleId": 113,
    "styles": [
      {
        "name": "ノーマル",
        "id": 113
      },
      {
        "name": "つよつよ",
        "id": 114
      },
      {
        "name": "よわよわ",
        "id": 115
      },
      {
        "name": "けだるげ",
        "id": 116
      },
      {
        "name": "ささやき",
        "id": 117
      }
    ]
  },
  {
    "name": "夜語トバリ",
    "styleName": "ノーマル",
    "styleId": 118,
    "styles": [
      {
        "name": "ノーマル",
        "id": 118
      },
      {
        "name": "明るい",
        "id": 119
      },
      {
        "name": "哀しみ",
        "id": 120
      },
      {
        "name": "呆れ",
        "id": 121
      }
    ]
  },
  {
    "name": "暁記ミタマ",
    "styleName": "ノーマル",
    "styleId": 122,
    "styles": [
      {
        "name": "ノーマル",
        "id": 122
      },
      {
        "name": "怒り",
        "id": 123
      },
      {
        "name": "哀しみ",
        "id": 124
      },
      {
        "name": "ささやき",
        "id": 125
      }
    ]
  },
  {
    "name": "里石ユカ",
    "styleName": "つぼみ",
    "styleId": 126,
    "styles": [
      {
        "name": "つぼみ",
        "id": 126
      }
    ]
  }
];
  const aliases = {
    'めたん': '四国めたん', 'きりたん': '東北きりたん', 'つむぎ': '春日部つむぎ',
    'はう': '雨晴はう', 'リツ': '波音リツ', '武宏': '玄野武宏', '虎太郎': '白上虎太郎',
    '龍星': '青山龍星', 'ひまり': '冥鳴ひまり', 'そら': '九州そら', 'もち子': 'もち子さん',
    '雌雄': '剣崎雌雄', '雪さん': 'WhiteCUL', 'ミコ': '櫻歌ミコ', '小夜': '小夜/SAYO',
    'SAYO': '小夜/SAYO', 'ナースロボ': 'ナースロボ＿タイプＴ', 'タイプT': 'ナースロボ＿タイプＴ',
    '紅桜': '†聖騎士 紅桜†', '朱司': '雀松朱司', '宗麟': '麒ヶ島宗麟', 'ナナ': '春歌ナナ',
    'アル': '猫使アル', 'ビィ': '猫使ビィ', 'うさぎ': '中国うさぎ', 'まろん': '栗田まろん',
    '花丸': '満別花丸', 'ニア': '琴詠ニア', 'つるぎ': '中部つるぎ', '冴白': '黒沢冴白',
    'ずん子': '東北ずん子', 'イタコ': '東北イタコ', 'トバリ': '夜語トバリ',
    'ミタマ': '暁記ミタマ', 'ユカ': '里石ユカ'
  };
  const normalize = name => name.normalize('NFKC').replace(/[ \t]/g, '').toLowerCase();
  function label(value) {
    return value.trim().replace(/^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D]+[ \t]*/u, '').trim();
  }
  let catalog = [];
  let names = new Map();
  function setCatalog(value) {
    if (!Array.isArray(value)) return false;
    const valid = value.filter(item => typeof item?.name === 'string' && item.name.trim() &&
      typeof item.styleName === 'string' && Number.isInteger(item.styleId) && item.styleId >= 0);
    if (!valid.length) return false;
    catalog = valid.map(({name, styleName, styleId, styles}) => {
      const available = (Array.isArray(styles) ? styles : []).filter(style =>
        typeof style?.name === 'string' && style.name.trim() && Number.isInteger(style.id) && style.id >= 0);
      if (!available.some(style => style.id === styleId)) available.unshift({name: styleName, id: styleId});
      return {name, styleName, styleId, styles: available.map(({name, id}) => ({name, id}))};
    });
    names = new Map(catalog.map(item => [normalize(item.name), item]));
    for (const [alias, official] of Object.entries(aliases)) {
      const item = names.get(normalize(official));
      if (item && !names.has(normalize(alias))) names.set(normalize(alias), item);
    }
    return true;
  }
  function fromSpeakers(speakers) {
    if (!Array.isArray(speakers)) return [];
    return speakers.flatMap(speaker => {
      const styles = (speaker.styles || []).filter(style => !style.type || style.type === 'talk');
      const style = styles.find(item => item.name === 'ノーマル') || styles.find(item => item.name === 'ふつう') || styles[0];
      return style ? [{name: speaker.name, styleName: style.name, styleId: style.id, styles: styles.map(({name, id}) => ({name, id}))}] : [];
    });
  }
  function resolveHeader(value) {
    const header = label(value);
    const match = /^(.*?)(?:[ \t]*[\[［]([^\[\]［］\n]*)[\]］])?$/.exec(header);
    if (!match) return {label: header, speaker: null};
    const speakerName = match[1].trim();
    const speaker = names.get(normalize(speakerName));
    const requestedStyle = match[2]?.trim() || '';
    if (!speaker) return {label: speakerName, speaker: null, requestedStyle};
    const style = requestedStyle ? speaker.styles.find(item => normalize(item.name) === normalize(requestedStyle)) : null;
    return {
      label: speakerName, requestedStyle, styleFallback: Boolean(requestedStyle && !style),
      speaker: {...speaker, styleName: style?.name ?? speaker.styleName, styleId: style?.id ?? speaker.styleId}
    };
  }
  setCatalog(bundled);
  root.voiceRegistry = {
    label, setCatalog, fromSpeakers, resolveHeader,
    resolve(value) { return names.get(normalize(label(value))); },
    get catalog() { return catalog.map(item => ({...item, styles: item.styles.map(style => ({...style}))})); },
    get styleIds() { return new Set(catalog.flatMap(item => item.styles.map(style => style.id))); }
  };
})(globalThis);
