"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; } function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } } function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; }// src/alpha-vault/index.ts
var _anchor = require('@coral-xyz/anchor');



var _spltoken = require('@solana/spl-token');





var _web3js = require('@solana/web3.js');

// src/alpha-vault/constant.ts

var PROGRAM_ID = Object.freeze({
  devnet: "vaU6kP7iNEGkbmPkLmZfGwiGxd4Mob24QQCie5R9kd2",
  "mainnet-beta": "vaU6kP7iNEGkbmPkLmZfGwiGxd4Mob24QQCie5R9kd2",
  localhost: "SNPmGgnywBvvrAKMLundzG6StojyHTHDLu7T4sdhP4k"
});
var SEED = Object.freeze({
  escrow: "escrow",
  vault: "vault",
  merkleRoot: "merkle_root",
  crankFeeWhitelist: "crank_fee_whitelist",
  merkleProofMetadata: "merkle_proof_metadata"
});
var ALPHA_VAULT_TREASURY_ID = new (0, _web3js.PublicKey)(
  "BJQbRiRWhJCyTYZcAuAL3ngDCx3AyFQGKDq8zhiZAKUw"
);
var VAULT_PROGRAM_ID = new (0, _web3js.PublicKey)(
  "24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi"
);
var DYNAMIC_AMM_PROGRAM_ID = new (0, _web3js.PublicKey)(
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB"
);
var DLMM_PROGRAM_ID = new (0, _web3js.PublicKey)(
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
);
var MERKLE_PROOF_API = Object.freeze({
  devnet: "https://worker-dev.meteora.ag/merkle-root-config-proof",
  "mainnet-beta": "https://worker.meteora.ag/merkle-root-config-proof"
});
var WhitelistMode = /* @__PURE__ */ ((WhitelistMode2) => {
  WhitelistMode2[WhitelistMode2["Permissionless"] = 0] = "Permissionless";
  WhitelistMode2[WhitelistMode2["PermissionWithMerkleProof"] = 1] = "PermissionWithMerkleProof";
  WhitelistMode2[WhitelistMode2["PermissionWithAuthority"] = 2] = "PermissionWithAuthority";
  return WhitelistMode2;
})(WhitelistMode || {});
var VaultState = /* @__PURE__ */ ((VaultState2) => {
  VaultState2[VaultState2["PREPARING"] = 0] = "PREPARING";
  VaultState2[VaultState2["DEPOSITING"] = 1] = "DEPOSITING";
  VaultState2[VaultState2["PURCHASING"] = 2] = "PURCHASING";
  VaultState2[VaultState2["LOCKING"] = 3] = "LOCKING";
  VaultState2[VaultState2["VESTING"] = 4] = "VESTING";
  VaultState2[VaultState2["ENDED"] = 5] = "ENDED";
  return VaultState2;
})(VaultState || {});

// src/alpha-vault/helper/index.ts







// src/alpha-vault/type.ts
var _borsh = require('@coral-xyz/borsh');
var VaultMode = /* @__PURE__ */ ((VaultMode2) => {
  VaultMode2[VaultMode2["PRORATA"] = 0] = "PRORATA";
  VaultMode2[VaultMode2["FCFS"] = 1] = "FCFS";
  return VaultMode2;
})(VaultMode || {});
var PoolType = /* @__PURE__ */ ((PoolType2) => {
  PoolType2[PoolType2["DLMM"] = 0] = "DLMM";
  PoolType2[PoolType2["DAMM"] = 1] = "DAMM";
  PoolType2[PoolType2["DAMMV2"] = 2] = "DAMMV2";
  return PoolType2;
})(PoolType || {});
var ActivationType = /* @__PURE__ */ ((ActivationType2) => {
  ActivationType2[ActivationType2["SLOT"] = 0] = "SLOT";
  ActivationType2[ActivationType2["TIMESTAMP"] = 1] = "TIMESTAMP";
  return ActivationType2;
})(ActivationType || {});
var ClockLayout = _borsh.struct.call(void 0, [
  _borsh.u64.call(void 0, "slot"),
  _borsh.i64.call(void 0, "epochStartTimestamp"),
  _borsh.u64.call(void 0, "epoch"),
  _borsh.u64.call(void 0, "leaderScheduleEpoch"),
  _borsh.i64.call(void 0, "unixTimestamp")
]);

// src/alpha-vault/helper/index.ts











var _dynamicammsdk = require('@meteora-ag/dynamic-amm-sdk'); var _dynamicammsdk2 = _interopRequireDefault(_dynamicammsdk);





var _dlmm = require('@meteora-ag/dlmm'); var _dlmm2 = _interopRequireDefault(_dlmm);
var _bnjs = require('bn.js'); var _bnjs2 = _interopRequireDefault(_bnjs);

// src/alpha-vault/alpha_vault.json
var alpha_vault_default = {
  address: "vaU6kP7iNEGkbmPkLmZfGwiGxd4Mob24QQCie5R9kd2",
  metadata: {
    name: "alpha_vault",
    version: "0.4.1",
    spec: "0.1.0",
    description: "Created with Anchor"
  },
  instructions: [
    {
      name: "claim_token",
      discriminator: [
        116,
        206,
        27,
        191,
        166,
        19,
        0,
        73
      ],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: [
            "escrow"
          ]
        },
        {
          name: "escrow",
          writable: true
        },
        {
          name: "token_out_vault",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "destination_token",
          writable: true
        },
        {
          name: "token_mint"
        },
        {
          name: "token_program"
        },
        {
          name: "owner",
          signer: true,
          relations: [
            "escrow"
          ]
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "close_crank_fee_whitelist",
      discriminator: [
        189,
        166,
        73,
        241,
        81,
        12,
        246,
        170
      ],
      accounts: [
        {
          name: "crank_fee_whitelist",
          writable: true
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "rent_receiver",
          writable: true
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "close_escrow",
      discriminator: [
        139,
        171,
        94,
        146,
        191,
        91,
        144,
        50
      ],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: [
            "escrow"
          ]
        },
        {
          name: "escrow",
          writable: true
        },
        {
          name: "owner",
          signer: true,
          relations: [
            "escrow"
          ]
        },
        {
          name: "rent_receiver",
          writable: true
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "close_fcfs_config",
      discriminator: [
        48,
        178,
        212,
        101,
        23,
        138,
        233,
        90
      ],
      accounts: [
        {
          name: "config",
          writable: true
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "rent_receiver",
          writable: true
        }
      ],
      args: []
    },
    {
      name: "close_merkle_proof_metadata",
      discriminator: [
        23,
        52,
        170,
        30,
        252,
        47,
        100,
        129
      ],
      accounts: [
        {
          name: "vault",
          relations: [
            "merkle_proof_metadata"
          ]
        },
        {
          name: "merkle_proof_metadata",
          writable: true
        },
        {
          name: "admin",
          signer: true
        },
        {
          name: "rent_receiver",
          writable: true
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "close_prorata_config",
      discriminator: [
        84,
        140,
        103,
        57,
        178,
        155,
        57,
        26
      ],
      accounts: [
        {
          name: "config",
          writable: true
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "rent_receiver",
          writable: true
        }
      ],
      args: []
    },
    {
      name: "create_crank_fee_whitelist",
      discriminator: [
        120,
        91,
        25,
        162,
        211,
        27,
        100,
        199
      ],
      accounts: [
        {
          name: "crank_fee_whitelist",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  99,
                  114,
                  97,
                  110,
                  107,
                  95,
                  102,
                  101,
                  101,
                  95,
                  119,
                  104,
                  105,
                  116,
                  101,
                  108,
                  105,
                  115,
                  116
                ]
              },
              {
                kind: "account",
                path: "cranker"
              }
            ]
          }
        },
        {
          name: "cranker"
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "create_fcfs_config",
      discriminator: [
        7,
        255,
        242,
        242,
        1,
        99,
        179,
        12
      ],
      accounts: [
        {
          name: "config",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  102,
                  99,
                  102,
                  115,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                kind: "arg",
                path: "config_parameters.index"
              }
            ]
          }
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        }
      ],
      args: [
        {
          name: "config_parameters",
          type: {
            defined: {
              name: "FcfsConfigParameters"
            }
          }
        }
      ]
    },
    {
      name: "create_merkle_proof_metadata",
      discriminator: [
        151,
        46,
        163,
        52,
        181,
        178,
        47,
        227
      ],
      accounts: [
        {
          name: "vault"
        },
        {
          name: "merkle_proof_metadata",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  109,
                  101,
                  114,
                  107,
                  108,
                  101,
                  95,
                  112,
                  114,
                  111,
                  111,
                  102,
                  95,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                kind: "account",
                path: "vault"
              }
            ]
          }
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "proof_url",
          type: "string"
        }
      ]
    },
    {
      name: "create_merkle_root_config",
      discriminator: [
        55,
        243,
        253,
        240,
        78,
        186,
        232,
        166
      ],
      accounts: [
        {
          name: "vault"
        },
        {
          name: "merkle_root_config",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  109,
                  101,
                  114,
                  107,
                  108,
                  101,
                  95,
                  114,
                  111,
                  111,
                  116
                ]
              },
              {
                kind: "account",
                path: "vault"
              },
              {
                kind: "arg",
                path: "params.version"
              }
            ]
          }
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "CreateMerkleRootConfigParams"
            }
          }
        }
      ]
    },
    {
      name: "create_new_escrow",
      discriminator: [
        60,
        154,
        170,
        202,
        252,
        109,
        83,
        199
      ],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "pool",
          relations: [
            "vault"
          ]
        },
        {
          name: "escrow",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                kind: "account",
                path: "vault"
              },
              {
                kind: "account",
                path: "owner"
              }
            ]
          }
        },
        {
          name: "owner"
        },
        {
          name: "payer",
          writable: true,
          signer: true
        },
        {
          name: "escrow_fee_receiver",
          writable: true,
          optional: true,
          address: "BJQbRiRWhJCyTYZcAuAL3ngDCx3AyFQGKDq8zhiZAKUw"
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "create_permissioned_escrow",
      discriminator: [
        60,
        166,
        36,
        85,
        96,
        137,
        132,
        184
      ],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: [
            "merkle_root_config"
          ]
        },
        {
          name: "pool",
          relations: [
            "vault"
          ]
        },
        {
          name: "escrow",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                kind: "account",
                path: "vault"
              },
              {
                kind: "account",
                path: "owner"
              }
            ]
          }
        },
        {
          name: "owner"
        },
        {
          name: "merkle_root_config",
          docs: [
            "merkle_root_config"
          ]
        },
        {
          name: "payer",
          writable: true,
          signer: true
        },
        {
          name: "escrow_fee_receiver",
          writable: true,
          optional: true,
          address: "BJQbRiRWhJCyTYZcAuAL3ngDCx3AyFQGKDq8zhiZAKUw"
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_cap",
          type: "u64"
        },
        {
          name: "proof",
          type: {
            vec: {
              array: [
                "u8",
                32
              ]
            }
          }
        }
      ]
    },
    {
      name: "create_permissioned_escrow_with_authority",
      discriminator: [
        211,
        231,
        194,
        69,
        65,
        11,
        123,
        93
      ],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "pool",
          relations: [
            "vault"
          ]
        },
        {
          name: "escrow",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                kind: "account",
                path: "vault"
              },
              {
                kind: "account",
                path: "owner"
              }
            ]
          }
        },
        {
          name: "owner"
        },
        {
          name: "payer",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_cap",
          type: "u64"
        }
      ]
    },
    {
      name: "create_prorata_config",
      discriminator: [
        38,
        203,
        72,
        231,
        103,
        29,
        195,
        61
      ],
      accounts: [
        {
          name: "config",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  112,
                  114,
                  111,
                  114,
                  97,
                  116,
                  97,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                kind: "arg",
                path: "config_parameters.index"
              }
            ]
          }
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        }
      ],
      args: [
        {
          name: "config_parameters",
          type: {
            defined: {
              name: "ProrataConfigParameters"
            }
          }
        }
      ]
    },
    {
      name: "deposit",
      discriminator: [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: [
            "escrow"
          ]
        },
        {
          name: "pool",
          relations: [
            "vault"
          ]
        },
        {
          name: "escrow",
          writable: true
        },
        {
          name: "source_token",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "token_mint"
        },
        {
          name: "token_program"
        },
        {
          name: "owner",
          signer: true,
          relations: [
            "escrow"
          ]
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_amount",
          type: "u64"
        }
      ]
    },
    {
      name: "fill_damm_v2",
      discriminator: [
        221,
        175,
        108,
        48,
        19,
        204,
        125,
        23
      ],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "token_out_vault",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "amm_program",
          address: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
        },
        {
          name: "pool_authority"
        },
        {
          name: "pool",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "token_a_vault",
          writable: true
        },
        {
          name: "token_b_vault",
          writable: true
        },
        {
          name: "token_a_mint"
        },
        {
          name: "token_b_mint"
        },
        {
          name: "token_a_program"
        },
        {
          name: "token_b_program"
        },
        {
          name: "damm_event_authority"
        },
        {
          name: "crank_fee_whitelist",
          optional: true
        },
        {
          name: "crank_fee_receiver",
          writable: true,
          optional: true,
          address: "BJQbRiRWhJCyTYZcAuAL3ngDCx3AyFQGKDq8zhiZAKUw"
        },
        {
          name: "cranker",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_amount",
          type: "u64"
        }
      ]
    },
    {
      name: "fill_dlmm",
      discriminator: [
        1,
        108,
        141,
        11,
        4,
        126,
        251,
        222
      ],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "token_out_vault",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "amm_program",
          address: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"
        },
        {
          name: "pool",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "bin_array_bitmap_extension"
        },
        {
          name: "reserve_x",
          writable: true
        },
        {
          name: "reserve_y",
          writable: true
        },
        {
          name: "token_x_mint"
        },
        {
          name: "token_y_mint"
        },
        {
          name: "oracle",
          writable: true
        },
        {
          name: "token_x_program"
        },
        {
          name: "token_y_program"
        },
        {
          name: "dlmm_event_authority"
        },
        {
          name: "crank_fee_whitelist",
          optional: true
        },
        {
          name: "crank_fee_receiver",
          writable: true,
          optional: true,
          address: "BJQbRiRWhJCyTYZcAuAL3ngDCx3AyFQGKDq8zhiZAKUw"
        },
        {
          name: "cranker",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "memo_program"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_amount",
          type: "u64"
        },
        {
          name: "remaining_accounts_info",
          type: {
            defined: {
              name: "RemainingAccountsInfo"
            }
          }
        }
      ]
    },
    {
      name: "fill_dynamic_amm",
      discriminator: [
        224,
        226,
        223,
        80,
        36,
        50,
        70,
        231
      ],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "token_out_vault",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "amm_program",
          address: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB"
        },
        {
          name: "pool",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "a_vault",
          writable: true
        },
        {
          name: "b_vault",
          writable: true
        },
        {
          name: "a_token_vault",
          writable: true
        },
        {
          name: "b_token_vault",
          writable: true
        },
        {
          name: "a_vault_lp_mint",
          writable: true
        },
        {
          name: "b_vault_lp_mint",
          writable: true
        },
        {
          name: "a_vault_lp",
          writable: true
        },
        {
          name: "b_vault_lp",
          writable: true
        },
        {
          name: "admin_token_fee",
          writable: true
        },
        {
          name: "vault_program"
        },
        {
          name: "token_program"
        },
        {
          name: "crank_fee_whitelist",
          optional: true
        },
        {
          name: "crank_fee_receiver",
          writable: true,
          optional: true,
          address: "BJQbRiRWhJCyTYZcAuAL3ngDCx3AyFQGKDq8zhiZAKUw"
        },
        {
          name: "cranker",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_amount",
          type: "u64"
        }
      ]
    },
    {
      name: "initialize_fcfs_vault",
      discriminator: [
        163,
        205,
        69,
        145,
        235,
        71,
        47,
        21
      ],
      accounts: [
        {
          name: "vault",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                kind: "account",
                path: "base"
              },
              {
                kind: "account",
                path: "pool"
              }
            ]
          }
        },
        {
          name: "pool"
        },
        {
          name: "funder",
          writable: true,
          signer: true
        },
        {
          name: "base",
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "InitializeFcfsVaultParams"
            }
          }
        }
      ]
    },
    {
      name: "initialize_prorata_vault",
      discriminator: [
        178,
        180,
        176,
        247,
        128,
        186,
        43,
        9
      ],
      accounts: [
        {
          name: "vault",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                kind: "account",
                path: "base"
              },
              {
                kind: "account",
                path: "pool"
              }
            ]
          }
        },
        {
          name: "pool"
        },
        {
          name: "funder",
          writable: true,
          signer: true
        },
        {
          name: "base",
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "InitializeProrataVaultParams"
            }
          }
        }
      ]
    },
    {
      name: "initialize_vault_with_fcfs_config",
      discriminator: [
        189,
        251,
        92,
        104,
        235,
        21,
        81,
        182
      ],
      accounts: [
        {
          name: "vault",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                kind: "account",
                path: "config"
              },
              {
                kind: "account",
                path: "pool"
              }
            ]
          }
        },
        {
          name: "pool"
        },
        {
          name: "quote_mint"
        },
        {
          name: "funder",
          writable: true,
          signer: true
        },
        {
          name: "config"
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "InitializeVaultWithConfigParams"
            }
          }
        }
      ]
    },
    {
      name: "initialize_vault_with_prorata_config",
      discriminator: [
        155,
        216,
        34,
        162,
        103,
        242,
        236,
        211
      ],
      accounts: [
        {
          name: "vault",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                kind: "account",
                path: "config"
              },
              {
                kind: "account",
                path: "pool"
              }
            ]
          }
        },
        {
          name: "pool"
        },
        {
          name: "quote_mint"
        },
        {
          name: "funder",
          writable: true,
          signer: true
        },
        {
          name: "config"
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "InitializeVaultWithConfigParams"
            }
          }
        }
      ]
    },
    {
      name: "transfer_vault_authority",
      discriminator: [
        139,
        35,
        83,
        88,
        52,
        186,
        162,
        110
      ],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "vault_authority",
          signer: true,
          relations: [
            "vault"
          ]
        }
      ],
      args: [
        {
          name: "new_authority",
          type: "pubkey"
        }
      ]
    },
    {
      name: "update_fcfs_vault_parameters",
      discriminator: [
        172,
        23,
        13,
        143,
        18,
        133,
        104,
        174
      ],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "pool",
          relations: [
            "vault"
          ]
        },
        {
          name: "admin",
          signer: true
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "UpdateFcfsVaultParams"
            }
          }
        }
      ]
    },
    {
      name: "update_prorata_vault_parameters",
      discriminator: [
        177,
        39,
        151,
        50,
        253,
        249,
        5,
        74
      ],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "pool",
          relations: [
            "vault"
          ]
        },
        {
          name: "admin",
          signer: true
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "UpdateProrataVaultParams"
            }
          }
        }
      ]
    },
    {
      name: "withdraw",
      discriminator: [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: [
            "escrow"
          ]
        },
        {
          name: "pool",
          relations: [
            "vault"
          ]
        },
        {
          name: "escrow",
          writable: true
        },
        {
          name: "destination_token",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "token_mint"
        },
        {
          name: "token_program"
        },
        {
          name: "owner",
          signer: true,
          relations: [
            "escrow"
          ]
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "amount",
          type: "u64"
        }
      ]
    },
    {
      name: "withdraw_remaining_quote",
      discriminator: [
        54,
        253,
        188,
        34,
        100,
        145,
        59,
        127
      ],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: [
            "escrow"
          ]
        },
        {
          name: "pool",
          relations: [
            "vault"
          ]
        },
        {
          name: "escrow",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: [
            "vault"
          ]
        },
        {
          name: "destination_token",
          writable: true
        },
        {
          name: "token_mint"
        },
        {
          name: "token_program"
        },
        {
          name: "owner",
          signer: true,
          relations: [
            "escrow"
          ]
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    }
  ],
  accounts: [
    {
      name: "CrankFeeWhitelist",
      discriminator: [
        39,
        105,
        184,
        30,
        248,
        231,
        176,
        133
      ]
    },
    {
      name: "Escrow",
      discriminator: [
        31,
        213,
        123,
        187,
        186,
        22,
        218,
        155
      ]
    },
    {
      name: "FcfsVaultConfig",
      discriminator: [
        99,
        243,
        252,
        122,
        160,
        175,
        130,
        52
      ]
    },
    {
      name: "MerkleProofMetadata",
      discriminator: [
        133,
        24,
        30,
        217,
        240,
        20,
        222,
        100
      ]
    },
    {
      name: "MerkleRootConfig",
      discriminator: [
        103,
        2,
        222,
        217,
        73,
        50,
        187,
        39
      ]
    },
    {
      name: "ProrataVaultConfig",
      discriminator: [
        93,
        214,
        205,
        104,
        119,
        9,
        51,
        152
      ]
    },
    {
      name: "Vault",
      discriminator: [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  events: [
    {
      name: "CrankFeeWhitelistClosed",
      discriminator: [
        157,
        171,
        85,
        155,
        37,
        20,
        41,
        114
      ]
    },
    {
      name: "CrankFeeWhitelistCreated",
      discriminator: [
        176,
        138,
        32,
        77,
        129,
        74,
        137,
        244
      ]
    },
    {
      name: "EscrowClaimToken",
      discriminator: [
        179,
        72,
        71,
        30,
        59,
        19,
        170,
        3
      ]
    },
    {
      name: "EscrowClosed",
      discriminator: [
        109,
        20,
        57,
        51,
        217,
        118,
        3,
        173
      ]
    },
    {
      name: "EscrowCreated",
      discriminator: [
        70,
        127,
        105,
        102,
        92,
        97,
        7,
        173
      ]
    },
    {
      name: "EscrowDeposit",
      discriminator: [
        43,
        90,
        49,
        176,
        134,
        148,
        50,
        32
      ]
    },
    {
      name: "EscrowRemainingWithdraw",
      discriminator: [
        113,
        14,
        156,
        89,
        113,
        79,
        88,
        178
      ]
    },
    {
      name: "EscrowWithdraw",
      discriminator: [
        171,
        17,
        164,
        116,
        122,
        66,
        183,
        34
      ]
    },
    {
      name: "FcfsVaultCreated",
      discriminator: [
        73,
        153,
        165,
        103,
        151,
        182,
        184,
        136
      ]
    },
    {
      name: "FcfsVaultParametersUpdated",
      discriminator: [
        78,
        112,
        112,
        62,
        193,
        209,
        231,
        226
      ]
    },
    {
      name: "MerkleProofMetadataCreated",
      discriminator: [
        186,
        42,
        131,
        176,
        244,
        128,
        196,
        68
      ]
    },
    {
      name: "MerkleRootConfigCreated",
      discriminator: [
        121,
        112,
        42,
        76,
        144,
        131,
        142,
        90
      ]
    },
    {
      name: "ProrataVaultCreated",
      discriminator: [
        181,
        255,
        162,
        226,
        203,
        199,
        193,
        6
      ]
    },
    {
      name: "ProrataVaultParametersUpdated",
      discriminator: [
        24,
        147,
        160,
        237,
        132,
        87,
        15,
        206
      ]
    },
    {
      name: "SwapFill",
      discriminator: [
        116,
        212,
        73,
        222,
        33,
        244,
        134,
        148
      ]
    }
  ],
  errors: [
    {
      code: 6e3,
      name: "TimePointNotInFuture",
      msg: "Time point is not in future"
    },
    {
      code: 6001,
      name: "IncorrectTokenMint",
      msg: "Token mint is incorrect"
    },
    {
      code: 6002,
      name: "IncorrectPairType",
      msg: "Pair is not permissioned"
    },
    {
      code: 6003,
      name: "PoolHasStarted",
      msg: "Pool has started"
    },
    {
      code: 6004,
      name: "NotPermitThisActionInThisTimePoint",
      msg: "This action is not permitted in this time point"
    },
    {
      code: 6005,
      name: "TheSaleIsOngoing",
      msg: "The sale is on going, cannot withdraw"
    },
    {
      code: 6006,
      name: "EscrowIsNotClosable",
      msg: "Escrow is not closable"
    },
    {
      code: 6007,
      name: "TimePointOrdersAreIncorrect",
      msg: "Time point orders are incorrect"
    },
    {
      code: 6008,
      name: "EscrowHasRefunded",
      msg: "Escrow has refunded"
    },
    {
      code: 6009,
      name: "MathOverflow",
      msg: "Math operation overflow"
    },
    {
      code: 6010,
      name: "MaxBuyingCapIsZero",
      msg: "Max buying cap is zero"
    },
    {
      code: 6011,
      name: "MaxAmountIsTooSmall",
      msg: "Max amount is too small"
    },
    {
      code: 6012,
      name: "PoolTypeIsNotSupported",
      msg: "Pool type is not supported"
    },
    {
      code: 6013,
      name: "InvalidAdmin",
      msg: "Invalid admin"
    },
    {
      code: 6014,
      name: "VaultModeIsIncorrect",
      msg: "Vault mode is incorrect"
    },
    {
      code: 6015,
      name: "MaxDepositingCapIsInValid",
      msg: "Max depositing cap is invalid"
    },
    {
      code: 6016,
      name: "VestingDurationIsInValid",
      msg: "Vesting duration is invalid"
    },
    {
      code: 6017,
      name: "DepositAmountIsZero",
      msg: "Deposit amount is zero"
    },
    {
      code: 6018,
      name: "PoolOwnerIsMismatched",
      msg: "Pool owner is mismatched"
    },
    {
      code: 6019,
      name: "WithdrawAmountIsZero",
      msg: "Withdraw amount is zero"
    },
    {
      code: 6020,
      name: "DepositingDurationIsInvalid",
      msg: "Depositing duration is invalid"
    },
    {
      code: 6021,
      name: "DepositingTimePointIsInvalid",
      msg: "Depositing time point is invalid"
    },
    {
      code: 6022,
      name: "IndividualDepositingCapIsZero",
      msg: "Individual depositing cap is zero"
    },
    {
      code: 6023,
      name: "InvalidFeeReceiverAccount",
      msg: "Invalid fee receiver account"
    },
    {
      code: 6024,
      name: "NotPermissionedVault",
      msg: "Not permissioned vault"
    },
    {
      code: 6025,
      name: "NotPermitToDoThisAction",
      msg: "Not permit to do this action"
    },
    {
      code: 6026,
      name: "InvalidProof",
      msg: "Invalid Merkle proof"
    },
    {
      code: 6027,
      name: "InvalidActivationType",
      msg: "Invalid activation type"
    },
    {
      code: 6028,
      name: "ActivationTypeIsMismatched",
      msg: "Activation type is mismatched"
    },
    {
      code: 6029,
      name: "InvalidPool",
      msg: "Pool is not connected to the alpha vault"
    },
    {
      code: 6030,
      name: "InvalidCreator",
      msg: "Invalid creator"
    },
    {
      code: 6031,
      name: "PermissionedVaultCannotChargeEscrowFee",
      msg: "Permissioned vault cannot charge escrow fee"
    },
    {
      code: 6032,
      name: "EscrowFeeTooHigh",
      msg: "Escrow fee too high"
    },
    {
      code: 6033,
      name: "LockDurationInvalid",
      msg: "Lock duration is invalid"
    },
    {
      code: 6034,
      name: "MaxBuyingCapIsTooSmall",
      msg: "Max buying cap is too small"
    },
    {
      code: 6035,
      name: "MaxDepositingCapIsTooSmall",
      msg: "Max depositing cap is too small"
    },
    {
      code: 6036,
      name: "InvalidWhitelistWalletMode",
      msg: "Invalid whitelist wallet mode"
    },
    {
      code: 6037,
      name: "InvalidCrankFeeWhitelist",
      msg: "Invalid crank fee whitelist"
    },
    {
      code: 6038,
      name: "MissingFeeReceiver",
      msg: "Missing fee receiver"
    },
    {
      code: 6039,
      name: "DiscriminatorIsMismatched",
      msg: "Discriminator is mismatched"
    }
  ],
  types: [
    {
      name: "AccountsType",
      type: {
        kind: "enum",
        variants: [
          {
            name: "TransferHookX"
          },
          {
            name: "TransferHookY"
          },
          {
            name: "TransferHookReward"
          }
        ]
      }
    },
    {
      name: "CrankFeeWhitelist",
      serialization: "bytemuck",
      repr: {
        kind: "c"
      },
      type: {
        kind: "struct",
        fields: [
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "padding",
            type: {
              array: [
                "u128",
                5
              ]
            }
          }
        ]
      }
    },
    {
      name: "CrankFeeWhitelistClosed",
      type: {
        kind: "struct",
        fields: [
          {
            name: "cranker",
            type: "pubkey"
          }
        ]
      }
    },
    {
      name: "CrankFeeWhitelistCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "cranker",
            type: "pubkey"
          }
        ]
      }
    },
    {
      name: "CreateMerkleRootConfigParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "root",
            docs: [
              "The 256-bit merkle root."
            ],
            type: {
              array: [
                "u8",
                32
              ]
            }
          },
          {
            name: "version",
            docs: [
              "version"
            ],
            type: "u64"
          }
        ]
      }
    },
    {
      name: "Escrow",
      serialization: "bytemuck",
      repr: {
        kind: "c"
      },
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            docs: [
              "vault address"
            ],
            type: "pubkey"
          },
          {
            name: "owner",
            docs: [
              "owner"
            ],
            type: "pubkey"
          },
          {
            name: "total_deposit",
            docs: [
              "total deposited quote token"
            ],
            type: "u64"
          },
          {
            name: "claimed_token",
            docs: [
              "Total token that escrow has claimed"
            ],
            type: "u64"
          },
          {
            name: "last_claimed_point",
            docs: [
              "Last claimed timestamp"
            ],
            type: "u64"
          },
          {
            name: "refunded",
            docs: [
              "Whether owner has claimed for remaining quote token"
            ],
            type: "u8"
          },
          {
            name: "padding_1",
            docs: [
              "padding 1"
            ],
            type: {
              array: [
                "u8",
                7
              ]
            }
          },
          {
            name: "max_cap",
            docs: [
              "Only has meaning in permissioned vault"
            ],
            type: "u64"
          },
          {
            name: "withdrawn_deposit_overflow",
            docs: [
              "Only has meaning in pro-rata vault"
            ],
            type: "u64"
          },
          {
            name: "padding",
            type: {
              array: [
                "u128",
                1
              ]
            }
          }
        ]
      }
    },
    {
      name: "EscrowClaimToken",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "amount",
            type: "u64"
          },
          {
            name: "vault_total_claimed_token",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "EscrowClosed",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "vault_total_escrow",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "EscrowCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "vault_total_escrow",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "EscrowDeposit",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "amount",
            type: "u64"
          },
          {
            name: "vault_total_deposit",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "EscrowRemainingWithdraw",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "amount",
            type: "u64"
          },
          {
            name: "vault_remaining_deposit",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "EscrowWithdraw",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "amount",
            type: "u64"
          },
          {
            name: "vault_total_deposit",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "FcfsConfigParameters",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "start_vesting_duration",
            type: "u64"
          },
          {
            name: "end_vesting_duration",
            type: "u64"
          },
          {
            name: "depositing_duration_until_last_join_point",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          },
          {
            name: "index",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "FcfsVaultConfig",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "start_vesting_duration",
            type: "u64"
          },
          {
            name: "end_vesting_duration",
            type: "u64"
          },
          {
            name: "depositing_duration_until_last_join_point",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          },
          {
            name: "_padding",
            type: {
              array: [
                "u8",
                175
              ]
            }
          }
        ]
      }
    },
    {
      name: "FcfsVaultCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "base_mint",
            type: "pubkey"
          },
          {
            name: "quote_mint",
            type: "pubkey"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          },
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "pool",
            type: "pubkey"
          },
          {
            name: "pool_type",
            type: "u8"
          },
          {
            name: "depositing_point",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "FcfsVaultParametersUpdated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          },
          {
            name: "depositing_point",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "InitializeFcfsVaultParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "pool_type",
            type: "u8"
          },
          {
            name: "quote_mint",
            type: "pubkey"
          },
          {
            name: "base_mint",
            type: "pubkey"
          },
          {
            name: "depositing_point",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          },
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "whitelist_mode",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "InitializeProrataVaultParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "pool_type",
            type: "u8"
          },
          {
            name: "quote_mint",
            type: "pubkey"
          },
          {
            name: "base_mint",
            type: "pubkey"
          },
          {
            name: "depositing_point",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          },
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "whitelist_mode",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "InitializeVaultWithConfigParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "pool_type",
            type: "u8"
          },
          {
            name: "quote_mint",
            type: "pubkey"
          },
          {
            name: "base_mint",
            type: "pubkey"
          },
          {
            name: "whitelist_mode",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "MerkleProofMetadata",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            docs: [
              "vault pubkey that config is belong"
            ],
            type: "pubkey"
          },
          {
            name: "padding",
            type: {
              array: [
                "u64",
                16
              ]
            }
          },
          {
            name: "proof_url",
            docs: [
              "proof url"
            ],
            type: "string"
          }
        ]
      }
    },
    {
      name: "MerkleProofMetadataCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "proof_url",
            type: "string"
          }
        ]
      }
    },
    {
      name: "MerkleRootConfig",
      serialization: "bytemuck",
      repr: {
        kind: "c"
      },
      type: {
        kind: "struct",
        fields: [
          {
            name: "root",
            docs: [
              "The 256-bit merkle root."
            ],
            type: {
              array: [
                "u8",
                32
              ]
            }
          },
          {
            name: "vault",
            docs: [
              "vault pubkey that config is belong"
            ],
            type: "pubkey"
          },
          {
            name: "version",
            docs: [
              "version"
            ],
            type: "u64"
          },
          {
            name: "_padding",
            docs: [
              "padding for further use"
            ],
            type: {
              array: [
                "u64",
                8
              ]
            }
          }
        ]
      }
    },
    {
      name: "MerkleRootConfigCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "admin",
            type: "pubkey"
          },
          {
            name: "config",
            type: "pubkey"
          },
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "version",
            type: "u64"
          },
          {
            name: "root",
            type: {
              array: [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      name: "ProrataConfigParameters",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "start_vesting_duration",
            type: "u64"
          },
          {
            name: "end_vesting_duration",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          },
          {
            name: "index",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "ProrataVaultConfig",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "start_vesting_duration",
            type: "u64"
          },
          {
            name: "end_vesting_duration",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          },
          {
            name: "_padding",
            type: {
              array: [
                "u8",
                191
              ]
            }
          }
        ]
      }
    },
    {
      name: "ProrataVaultCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "base_mint",
            type: "pubkey"
          },
          {
            name: "quote_mint",
            type: "pubkey"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          },
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "pool",
            type: "pubkey"
          },
          {
            name: "pool_type",
            type: "u8"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "ProrataVaultParametersUpdated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "RemainingAccountsInfo",
      type: {
        kind: "struct",
        fields: [
          {
            name: "slices",
            type: {
              vec: {
                defined: {
                  name: "RemainingAccountsSlice"
                }
              }
            }
          }
        ]
      }
    },
    {
      name: "RemainingAccountsSlice",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accounts_type",
            type: {
              defined: {
                name: "AccountsType"
              }
            }
          },
          {
            name: "length",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "SwapFill",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "pair",
            type: "pubkey"
          },
          {
            name: "fill_amount",
            type: "u64"
          },
          {
            name: "purchased_amount",
            type: "u64"
          },
          {
            name: "unfilled_amount",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "UpdateFcfsVaultParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "depositing_point",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "UpdateProrataVaultParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "Vault",
      serialization: "bytemuck",
      repr: {
        kind: "c"
      },
      type: {
        kind: "struct",
        fields: [
          {
            name: "pool",
            docs: [
              "pool"
            ],
            type: "pubkey"
          },
          {
            name: "token_vault",
            docs: [
              "reserve quote token"
            ],
            type: "pubkey"
          },
          {
            name: "token_out_vault",
            docs: [
              "reserve base token"
            ],
            type: "pubkey"
          },
          {
            name: "quote_mint",
            docs: [
              "quote token"
            ],
            type: "pubkey"
          },
          {
            name: "base_mint",
            docs: [
              "base token"
            ],
            type: "pubkey"
          },
          {
            name: "base",
            docs: [
              "base key"
            ],
            type: "pubkey"
          },
          {
            name: "owner",
            docs: [
              "owner key, deprecated field, can re-use in the future"
            ],
            type: "pubkey"
          },
          {
            name: "max_buying_cap",
            docs: [
              "max buying cap"
            ],
            type: "u64"
          },
          {
            name: "total_deposit",
            docs: [
              "total deposited quote token"
            ],
            type: "u64"
          },
          {
            name: "total_escrow",
            docs: [
              "total user deposit"
            ],
            type: "u64"
          },
          {
            name: "swapped_amount",
            docs: [
              "swapped_amount"
            ],
            type: "u64"
          },
          {
            name: "bought_token",
            docs: [
              "total bought token"
            ],
            type: "u64"
          },
          {
            name: "total_refund",
            docs: [
              "Total quote refund"
            ],
            type: "u64"
          },
          {
            name: "total_claimed_token",
            docs: [
              "Total claimed_token"
            ],
            type: "u64"
          },
          {
            name: "start_vesting_point",
            docs: [
              "Start vesting ts"
            ],
            type: "u64"
          },
          {
            name: "end_vesting_point",
            docs: [
              "End vesting ts"
            ],
            type: "u64"
          },
          {
            name: "bump",
            docs: [
              "bump"
            ],
            type: "u8"
          },
          {
            name: "pool_type",
            docs: [
              "pool type"
            ],
            type: "u8"
          },
          {
            name: "vault_mode",
            docs: [
              "vault mode"
            ],
            type: "u8"
          },
          {
            name: "padding_0",
            docs: [
              "padding 0"
            ],
            type: {
              array: [
                "u8",
                5
              ]
            }
          },
          {
            name: "max_depositing_cap",
            docs: [
              "max depositing cap"
            ],
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            docs: [
              "individual depositing cap"
            ],
            type: "u64"
          },
          {
            name: "depositing_point",
            docs: [
              "depositing point"
            ],
            type: "u64"
          },
          {
            name: "escrow_fee",
            docs: [
              "flat fee when user open an escrow"
            ],
            type: "u64"
          },
          {
            name: "total_escrow_fee",
            docs: [
              "total escrow fee just for statistic"
            ],
            type: "u64"
          },
          {
            name: "whitelist_mode",
            docs: [
              "deposit whitelist mode"
            ],
            type: "u8"
          },
          {
            name: "activation_type",
            docs: [
              "activation type"
            ],
            type: "u8"
          },
          {
            name: "padding_1",
            docs: [
              "padding 1"
            ],
            type: {
              array: [
                "u8",
                6
              ]
            }
          },
          {
            name: "vault_authority",
            docs: [
              "vault authority normally is vault creator, will be able to create merkle root config"
            ],
            type: "pubkey"
          },
          {
            name: "padding",
            type: {
              array: [
                "u128",
                5
              ]
            }
          }
        ]
      }
    }
  ]
};

// src/alpha-vault/helper/index.ts



var _anchor0280 = require('@cora-xyz/anchor-0.28.0');




var _cpammsdk = require('@meteora-ag/cp-amm-sdk'); var _cpammsdk2 = _interopRequireDefault(_cpammsdk);
var MEMO_PROGRAM_ID = new (0, _web3js.PublicKey)(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
function createProgram(connection, opt) {
  const provider = new (0, _anchor.AnchorProvider)(
    connection,
    {},
    _anchor.AnchorProvider.defaultOptions()
  );
  return new (0, _anchor.Program)(
    { ...alpha_vault_default, address: PROGRAM_ID[_optionalChain([opt, 'optionalAccess', _ => _.cluster]) || "mainnet-beta"] },
    provider
  );
}
function createDlmmProgram(connection, opt) {
  const provider = new (0, _anchor0280.AnchorProvider)(
    connection,
    {},
    _anchor.AnchorProvider.defaultOptions()
  );
  return new (0, _anchor0280.Program)(
    _dlmm.IDL,
    _dlmm.LBCLMM_PROGRAM_IDS[_optionalChain([opt, 'optionalAccess', _2 => _2.cluster]) || "mainnet-beta"],
    provider
  );
}
function createDammProgram(connection, opt) {
  const provider = new (0, _anchor0280.AnchorProvider)(
    connection,
    {},
    _anchor.AnchorProvider.defaultOptions()
  );
  return new (0, _anchor0280.Program)(_dynamicammsdk.AmmIdl, DYNAMIC_AMM_PROGRAM_ID, provider);
}
function createCpAmmProgram(connection, opt) {
  const provider = new (0, _anchor.AnchorProvider)(
    connection,
    {},
    _anchor.AnchorProvider.defaultOptions()
  );
  return new (0, _anchor.Program)(
    { ...(_cpammsdk.CpAmmIdl || _cpammsdk2.default), address: _cpammsdk.CP_AMM_PROGRAM_ID },
    provider
  );
}
function deriveCrankFeeWhitelist(cranker, programId) {
  return _web3js.PublicKey.findProgramAddressSync(
    [Buffer.from(SEED.crankFeeWhitelist), cranker.toBuffer()],
    programId
  );
}
function deriveMerkleProofMetadata(alphaVault, programId) {
  return _web3js.PublicKey.findProgramAddressSync(
    [Buffer.from(SEED.merkleProofMetadata), alphaVault.toBuffer()],
    programId
  );
}
function deriveMerkleRootConfig(alphaVault, version, programId) {
  return _web3js.PublicKey.findProgramAddressSync(
    [
      Buffer.from(SEED.merkleRoot),
      alphaVault.toBuffer(),
      new Uint8Array(version.toArrayLike(Buffer, "le", 8))
    ],
    programId
  );
}
function deriveEscrow(alphaVault, owner, programId) {
  return _web3js.PublicKey.findProgramAddressSync(
    [Buffer.from(SEED.escrow), alphaVault.toBuffer(), owner.toBuffer()],
    programId
  );
}
function deriveAlphaVault(base, lbPair, programId) {
  return _web3js.PublicKey.findProgramAddressSync(
    [Buffer.from(SEED.vault), base.toBuffer(), lbPair.toBuffer()],
    programId
  );
}
var getOrCreateATAInstruction = async (connection, tokenMint, owner, payer = owner, tokenProgram, allowOwnerOffCurve = true) => {
  const toAccount = _spltoken.getAssociatedTokenAddressSync.call(void 0, 
    tokenMint,
    owner,
    allowOwnerOffCurve,
    tokenProgram
  );
  try {
    await _spltoken.getAccount.call(void 0, connection, toAccount);
    return { ataPubKey: toAccount, ix: void 0 };
  } catch (e) {
    if (e instanceof _spltoken.TokenAccountNotFoundError || e instanceof _spltoken.TokenInvalidAccountOwnerError) {
      const ix = _spltoken.createAssociatedTokenAccountIdempotentInstruction.call(void 0, 
        payer,
        toAccount,
        owner,
        tokenMint,
        tokenProgram
      );
      return { ataPubKey: toAccount, ix };
    } else {
      console.error("Error::getOrCreateATAInstruction", e);
      throw e;
    }
  }
};
var wrapSOLInstruction = (from, to, amount) => {
  return [
    _web3js.SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: amount
    }),
    new (0, _web3js.TransactionInstruction)({
      keys: [
        {
          pubkey: to,
          isSigner: false,
          isWritable: true
        }
      ],
      data: Buffer.from(new Uint8Array([17])),
      programId: _spltoken.TOKEN_PROGRAM_ID
    })
  ];
};
var unwrapSOLInstruction = (owner) => {
  const wSolATAAccount = _spltoken.getAssociatedTokenAddressSync.call(void 0, 
    _spltoken.NATIVE_MINT,
    owner,
    true
  );
  if (wSolATAAccount) {
    const closedWrappedSolInstruction = _spltoken.createCloseAccountInstruction.call(void 0, 
      wSolATAAccount,
      owner,
      owner
    );
    return closedWrappedSolInstruction;
  }
  return null;
};
var fillDammV2Transaction = async (program, vaultKey, vault, payer) => {
  const connection = program.provider.connection;
  const cpAmm = new (0, _cpammsdk.CpAmm)(connection);
  const pool = await cpAmm._program.account.pool.fetch(vault.pool);
  const [poolAuthority] = _web3js.PublicKey.findProgramAddressSync(
    [Buffer.from("pool_authority")],
    cpAmm._program.programId
  );
  const [dammEventAuthority] = _web3js.PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    cpAmm._program.programId
  );
  const [crankFeeWhitelist] = deriveCrankFeeWhitelist(payer, program.programId);
  const crankFeeWhitelistAccount = await connection.getAccountInfo(crankFeeWhitelist);
  const preInstructions = [];
  const { ataPubKey: tokenOutVault, ix: createTokenOutVaultIx } = await getOrCreateATAInstruction(
    connection,
    vault.baseMint,
    vaultKey,
    payer,
    pool.tokenAFlag == 0 ? _spltoken.TOKEN_PROGRAM_ID : _spltoken.TOKEN_2022_PROGRAM_ID
  );
  createTokenOutVaultIx && preInstructions.push(createTokenOutVaultIx);
  const fillDammInstruction = await program.methods.fillDammV2(vault.maxBuyingCap).accountsPartial({
    vault: vaultKey,
    tokenVault: vault.tokenVault,
    tokenOutVault,
    ammProgram: cpAmm._program.programId,
    pool: vault.pool,
    poolAuthority,
    tokenAMint: pool.tokenAMint,
    tokenBMint: pool.tokenBMint,
    tokenAVault: pool.tokenAVault,
    tokenBVault: pool.tokenBVault,
    tokenAProgram: pool.tokenAFlag == 0 ? _spltoken.TOKEN_PROGRAM_ID : _spltoken.TOKEN_2022_PROGRAM_ID,
    tokenBProgram: pool.tokenBFlag == 0 ? _spltoken.TOKEN_PROGRAM_ID : _spltoken.TOKEN_2022_PROGRAM_ID,
    cranker: payer,
    crankFeeReceiver: crankFeeWhitelistAccount ? program.programId : ALPHA_VAULT_TREASURY_ID,
    crankFeeWhitelist: crankFeeWhitelistAccount ? crankFeeWhitelist : program.programId,
    dammEventAuthority,
    systemProgram: _web3js.SystemProgram.programId
  }).instruction();
  const { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash("confirmed");
  return new (0, _web3js.Transaction)({
    lastValidBlockHeight,
    blockhash,
    feePayer: payer
  }).add(...preInstructions, fillDammInstruction);
};
var fillDlmmTransaction = async (program, vaultKey, vault, payer, opt) => {
  const connection = program.provider.connection;
  const cluster = _nullishCoalesce(_optionalChain([opt, 'optionalAccess', _3 => _3.cluster]), () => ( "mainnet-beta"));
  const pair = await _dlmm2.default.create(connection, vault.pool, {
    cluster
  });
  const [crankFeeWhitelist] = deriveCrankFeeWhitelist(payer, program.programId);
  const crankFeeWhitelistAccount = await connection.getAccountInfo(crankFeeWhitelist);
  const preInstructions = [
    _web3js.ComputeBudgetProgram.setComputeUnitLimit({
      units: 14e5
    })
  ];
  const { ataPubKey: tokenOutVault, ix: createTokenOutVaultIx } = await getOrCreateATAInstruction(
    connection,
    vault.baseMint,
    vaultKey,
    payer,
    pair.tokenX.owner
  );
  createTokenOutVaultIx && preInstructions.push(createTokenOutVaultIx);
  const inAmountCap = vault.vaultMode == 1 /* FCFS */ ? vault.totalDeposit : vault.totalDeposit.lt(vault.maxBuyingCap) ? vault.totalDeposit : vault.maxBuyingCap;
  const remainingInAmount = inAmountCap.sub(vault.swappedAmount);
  if (remainingInAmount.lte(new (0, _bnjs2.default)(0)))
    return;
  const swapForY = pair.lbPair.tokenXMint.equals(vault.quoteMint);
  const binArrays = await pair.getBinArrayForSwap(swapForY, 3);
  let quoteResult;
  try {
    quoteResult = pair.swapQuote(
      remainingInAmount,
      swapForY,
      new (0, _bnjs2.default)(0),
      binArrays,
      true
    );
  } catch (error) {
    if (error instanceof _dlmm.DlmmSdkError) {
      if (error.name == "SWAP_QUOTE_INSUFFICIENT_LIQUIDITY") {
        return null;
      }
    }
    throw error;
  }
  const { consumedInAmount, binArraysPubkey } = quoteResult;
  const dlmmProgramId = new (0, _web3js.PublicKey)(_dlmm.LBCLMM_PROGRAM_IDS[cluster]);
  const [dlmmEventAuthority] = _web3js.PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    dlmmProgramId
  );
  const tokenXProgram = pair.tokenX.owner;
  const tokenYProgram = pair.tokenY.owner;
  const remainingAccountInfos = {
    slices: [
      {
        accountsType: {
          transferHookX: {}
        },
        length: pair.tokenX.transferHookAccountMetas.length
      },
      {
        accountsType: {
          transferHookY: {}
        },
        length: pair.tokenY.transferHookAccountMetas.length
      }
    ]
  };
  const binArrayAccounts = binArraysPubkey.map((x) => ({
    pubkey: x,
    isSigner: false,
    isWritable: true
  }));
  const transferHookAccounts = [
    ...pair.tokenX.transferHookAccountMetas,
    ...pair.tokenY.transferHookAccountMetas
  ];
  const remainingAccounts = [...transferHookAccounts, ...binArrayAccounts];
  const fillDlmmTransaction2 = await program.methods.fillDlmm(consumedInAmount, remainingAccountInfos).accountsPartial({
    vault: vaultKey,
    tokenVault: vault.tokenVault,
    tokenOutVault,
    ammProgram: dlmmProgramId,
    pool: vault.pool,
    binArrayBitmapExtension: pair.binArrayBitmapExtension ? pair.binArrayBitmapExtension.publicKey : pair.program.programId,
    reserveX: pair.lbPair.reserveX,
    reserveY: pair.lbPair.reserveY,
    tokenXMint: pair.lbPair.tokenXMint,
    tokenYMint: pair.lbPair.tokenYMint,
    oracle: pair.lbPair.oracle,
    tokenXProgram,
    tokenYProgram,
    dlmmEventAuthority,
    cranker: payer,
    crankFeeReceiver: crankFeeWhitelistAccount ? program.programId : ALPHA_VAULT_TREASURY_ID,
    crankFeeWhitelist: crankFeeWhitelistAccount ? crankFeeWhitelist : program.programId,
    systemProgram: _web3js.SystemProgram.programId,
    memoProgram: MEMO_PROGRAM_ID
  }).preInstructions(preInstructions).remainingAccounts(remainingAccounts).transaction();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  return new (0, _web3js.Transaction)({
    blockhash,
    lastValidBlockHeight,
    feePayer: payer
  }).add(fillDlmmTransaction2);
};
var fillDammTransaction = async (program, vaultKey, vault, payer, opt) => {
  if (vault.vaultMode === 0 /* PRORATA */) {
    if (vault.swappedAmount.eq(_bnjs2.default.min(vault.totalDeposit, vault.maxBuyingCap)))
      return;
  } else {
    if (vault.swappedAmount.eq(vault.totalDeposit))
      return;
  }
  const connection = program.provider.connection;
  const pool = await _dynamicammsdk2.default.create(connection, vault.pool, {
    cluster: _nullishCoalesce(_optionalChain([opt, 'optionalAccess', _4 => _4.cluster]), () => ( "mainnet-beta"))
  });
  const [crankFeeWhitelist] = deriveCrankFeeWhitelist(payer, program.programId);
  const crankFeeWhitelistAccount = await connection.getAccountInfo(crankFeeWhitelist);
  const preInstructions = [];
  const { ataPubKey: tokenOutVault, ix: createTokenOutVaultIx } = await getOrCreateATAInstruction(
    connection,
    vault.baseMint,
    vaultKey,
    payer,
    _spltoken.TOKEN_PROGRAM_ID
  );
  createTokenOutVaultIx && preInstructions.push(createTokenOutVaultIx);
  const adminTokenFee = vault.quoteMint.equals(pool.poolState.tokenBMint) ? pool.poolState.protocolTokenBFee : pool.poolState.protocolTokenAFee;
  const fillAmmTransaction = await program.methods.fillDynamicAmm(vault.totalDeposit).accountsPartial({
    vault: vaultKey,
    tokenVault: vault.tokenVault,
    tokenOutVault,
    ammProgram: DYNAMIC_AMM_PROGRAM_ID,
    pool: vault.pool,
    aVault: pool.vaultA.vaultPda,
    bVault: pool.vaultB.vaultPda,
    aTokenVault: pool.vaultA.tokenVaultPda,
    bTokenVault: pool.vaultB.tokenVaultPda,
    aVaultLp: pool.poolState.aVaultLp,
    bVaultLp: pool.poolState.bVaultLp,
    aVaultLpMint: pool.vaultA.tokenLpMint.address,
    bVaultLpMint: pool.vaultB.tokenLpMint.address,
    adminTokenFee,
    vaultProgram: VAULT_PROGRAM_ID,
    tokenProgram: _spltoken.TOKEN_PROGRAM_ID,
    cranker: payer,
    crankFeeReceiver: crankFeeWhitelistAccount ? program.programId : ALPHA_VAULT_TREASURY_ID,
    crankFeeWhitelist: crankFeeWhitelistAccount ? crankFeeWhitelist : program.programId,
    systemProgram: _web3js.SystemProgram.programId
  }).preInstructions(preInstructions).transaction();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  return new (0, _web3js.Transaction)({
    blockhash,
    lastValidBlockHeight,
    feePayer: payer
  }).add(fillAmmTransaction);
};
var estimateSlotDate = (enableSlot, slotAverageTime, currentSlot) => {
  const estimateDate = new Date(
    Date.now() + (enableSlot - currentSlot) * slotAverageTime
  );
  return estimateDate;
};

// src/alpha-vault/merkle_tree/balance-tree.ts

var _jssha256 = require('js-sha256');

// src/alpha-vault/merkle_tree/merkle-tree.ts

var _tinyinvariant = require('tiny-invariant'); var _tinyinvariant2 = _interopRequireDefault(_tinyinvariant);
function getPairElement(idx, layer) {
  const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
  if (pairIdx < layer.length) {
    const pairEl = layer[pairIdx];
    _tinyinvariant2.default.call(void 0, pairEl, "pairEl");
    return pairEl;
  } else {
    return null;
  }
}
function bufDedup(elements) {
  return elements.filter((el, idx) => {
    return idx === 0 || !_optionalChain([elements, 'access', _5 => _5[idx - 1], 'optionalAccess', _6 => _6.equals, 'call', _7 => _7(el)]);
  });
}
function bufArrToHexArr(arr) {
  if (arr.some((el) => !Buffer.isBuffer(el))) {
    throw new Error("Array is not an array of buffers");
  }
  return arr.map((el) => "0x" + el.toString("hex"));
}
function sortAndConcat(...args) {
  return Buffer.concat([
    Buffer.from([1]),
    Buffer.concat([...args].sort(Buffer.compare.bind(null)))
  ]);
}
var MerkleTree = class {
  
  
  
  constructor(elements) {
    this._elements = [...elements];
    this._elements.sort(Buffer.compare.bind(null));
    this._elements = bufDedup(this._elements);
    this._bufferElementPositionIndex = this._elements.reduce((memo, el, index) => {
      memo[el.toString("hex")] = index;
      return memo;
    }, {});
    this._layers = this.getLayers(this._elements);
  }
  getLayers(elements) {
    if (elements.length === 0) {
      throw new Error("empty tree");
    }
    const layers = [];
    layers.push(elements);
    while ((_nullishCoalesce(_optionalChain([layers, 'access', _8 => _8[layers.length - 1], 'optionalAccess', _9 => _9.length]), () => ( 0))) > 1) {
      const nextLayerIndex = layers[layers.length - 1];
      _tinyinvariant2.default.call(void 0, nextLayerIndex, "nextLayerIndex");
      layers.push(this.getNextLayer(nextLayerIndex));
    }
    return layers;
  }
  getNextLayer(elements) {
    return elements.reduce((layer, el, idx, arr) => {
      if (idx % 2 === 0) {
        const pairEl = arr[idx + 1];
        layer.push(MerkleTree.combinedHash(el, pairEl));
      }
      return layer;
    }, []);
  }
  static combinedHash(first, second) {
    if (!first) {
      _tinyinvariant2.default.call(void 0, second, "second element of pair must exist");
      return second;
    }
    if (!second) {
      _tinyinvariant2.default.call(void 0, first, "first element of pair must exist");
      return first;
    }
    return Buffer.from(_jssha256.sha256.call(void 0, sortAndConcat(first, second)), "hex");
  }
  getRoot() {
    const root = _optionalChain([this, 'access', _10 => _10._layers, 'access', _11 => _11[this._layers.length - 1], 'optionalAccess', _12 => _12[0]]);
    _tinyinvariant2.default.call(void 0, root, "root");
    return root;
  }
  getHexRoot() {
    return this.getRoot().toString("hex");
  }
  getProof(el) {
    const initialIdx = this._bufferElementPositionIndex[el.toString("hex")];
    if (typeof initialIdx !== "number") {
      throw new Error("Element does not exist in Merkle tree");
    }
    let idx = initialIdx;
    return this._layers.reduce((proof, layer) => {
      const pairElement = getPairElement(idx, layer);
      if (pairElement) {
        proof.push(pairElement);
      }
      idx = Math.floor(idx / 2);
      return proof;
    }, []);
  }
  getHexProof(el) {
    const proof = this.getProof(el);
    return bufArrToHexArr(proof);
  }
};

// src/alpha-vault/merkle_tree/balance-tree.ts
var BalanceTree = class {
  
  constructor(balances) {
    this._tree = new MerkleTree(
      balances.map(({ account, maxCap }, index) => {
        return BalanceTree.toNode(account, maxCap);
      })
    );
  }
  static verifyProof(account, maxCap, proof, root) {
    let pair = BalanceTree.toNode(account, maxCap);
    for (const item of proof) {
      pair = MerkleTree.combinedHash(pair, item);
    }
    return pair.equals(root);
  }
  // keccak256(abi.encode(index, account, amount))
  static toNode(account, maxCap) {
    const buf = Buffer.concat([
      account.toBuffer(),
      new (0, _anchor.BN)(maxCap).toArrayLike(Buffer, "le", 8)
    ]);
    const hashedBuff = Buffer.from(_jssha256.sha256.call(void 0, buf), "hex");
    const bufWithPrefix = Buffer.concat([Buffer.from([0]), hashedBuff]);
    return Buffer.from(_jssha256.sha256.call(void 0, bufWithPrefix), "hex");
  }
  getHexRoot() {
    return this._tree.getHexRoot();
  }
  // returns the hex bytes32 values of the proof
  getHexProof(account, maxCap) {
    return this._tree.getHexProof(BalanceTree.toNode(account, maxCap));
  }
  getRoot() {
    return this._tree.getRoot();
  }
  getProof(account, maxCap) {
    return this._tree.getProof(BalanceTree.toNode(account, maxCap));
  }
};

// src/alpha-vault/index.ts
var AlphaVault = class {
  constructor(program, pubkey, vault, activationPoint, preActivationDuration, clock, baseMintInfo, quoteMintInfo, opt) {
    this.program = program;
    this.pubkey = pubkey;
    this.vault = vault;
    this.activationPoint = activationPoint;
    this.preActivationDuration = preActivationDuration;
    this.clock = clock;
    this.baseMintInfo = baseMintInfo;
    this.quoteMintInfo = quoteMintInfo;
    this.opt = opt;
  }
  /** Getter */
  get mode() {
    return this.vault.vaultMode === 0 ? 0 /* PRORATA */ : 1 /* FCFS */;
  }
  get vaultPoint() {
    const firstJoinPoint = Number(this.vault.depositingPoint.toString());
    const lastJoinPoint = Number(
      this.activationPoint.sub(
        process.env.NODE_ENV === "test" ? new (0, _anchor.BN)(5) : this.preActivationDuration
      ).sub(
        process.env.NODE_ENV === "test" ? new (0, _anchor.BN)(1) : new (0, _anchor.BN)(
          this.vault.activationType === 0 /* SLOT */ ? 750 : 5 * 60
        )
      ).toString()
    );
    const lastBuyingPoint = Number(
      this.activationPoint.sub(new (0, _anchor.BN)(1)).toString()
    );
    const startVestingPoint = Number(this.vault.startVestingPoint.toString());
    const endVestingPoint = Number(this.vault.endVestingPoint.toString());
    return {
      firstJoinPoint,
      lastJoinPoint,
      lastBuyingPoint,
      startVestingPoint,
      endVestingPoint
    };
  }
  get vaultState() {
    const currentSlot = this.clock.slot.toNumber();
    const currentTimestamp = this.clock.unixTimestamp.toNumber();
    const {
      firstJoinPoint,
      lastJoinPoint,
      lastBuyingPoint,
      startVestingPoint,
      endVestingPoint
    } = this.vaultPoint;
    let vaultState = 0 /* PREPARING */;
    const currentPoint = this.vault.activationType === 0 /* SLOT */ ? currentSlot : currentTimestamp;
    if (firstJoinPoint > currentPoint) {
      vaultState = 0 /* PREPARING */;
    } else if (lastJoinPoint >= currentPoint && firstJoinPoint <= currentPoint) {
      vaultState = 1 /* DEPOSITING */;
    } else if (lastJoinPoint < currentPoint && lastBuyingPoint >= currentPoint) {
      vaultState = 2 /* PURCHASING */;
    } else if (lastBuyingPoint < currentPoint && startVestingPoint > currentPoint) {
      vaultState = 3 /* LOCKING */;
    } else if (startVestingPoint <= currentPoint && endVestingPoint > currentPoint) {
      vaultState = 4 /* VESTING */;
    } else if (endVestingPoint <= currentPoint) {
      vaultState = 5 /* ENDED */;
    }
    return vaultState;
  }
  /** End Getter */
  /** Static Function */
  /**
   * Creates an AlphaVault instance from a given vault address.
   *
   * @param {Connection} connection - The Solana connection to use.
   * @param {PublicKey} vaultAddress - The address of the vault to create an instance for.
   * @param {Opt} [opt] - Optional configuration options.
   * @return {Promise<AlphaVault>} A promise resolving to the created AlphaVault instance.
   */
  static async create(connection, vaultAddress, opt) {
    const provider = new (0, _anchor.AnchorProvider)(
      connection,
      {},
      _anchor.AnchorProvider.defaultOptions()
    );
    const cluster = _optionalChain([opt, 'optionalAccess', _13 => _13.cluster]) || "mainnet-beta";
    const program = createProgram(connection, opt);
    const accountsToFetch = [vaultAddress, _web3js.SYSVAR_CLOCK_PUBKEY];
    const [vaultAccountBuffer, clockAccountBuffer] = await connection.getMultipleAccountsInfo(accountsToFetch);
    const vault = program.coder.accounts.decode(
      "vault",
      vaultAccountBuffer.data
    );
    const clockState = ClockLayout.decode(clockAccountBuffer.data);
    const accounts = await connection.getMultipleAccountsInfo([
      vault.baseMint,
      vault.quoteMint
    ]);
    const baseMintAccount = accounts[0];
    const baseMint = _spltoken.unpackMint.call(void 0, 
      vault.baseMint,
      baseMintAccount,
      baseMintAccount.owner
    );
    const baseMintInfo = {
      tokenProgram: baseMintAccount.owner,
      mint: baseMint
    };
    const quoteMintAccount = accounts[1];
    const quoteMint = _spltoken.unpackMint.call(void 0, 
      vault.quoteMint,
      quoteMintAccount,
      quoteMintAccount.owner
    );
    const quoteMintInfo = {
      tokenProgram: quoteMintAccount.owner,
      mint: quoteMint
    };
    if (vault.poolType === 0 /* DLMM */) {
      const dlmmProgram = createDlmmProgram(connection, opt);
      const pool = await dlmmProgram.account.lbPair.fetch(
        vault.pool
      );
      return new AlphaVault(
        program,
        vaultAddress,
        vault,
        pool.activationPoint,
        pool.preActivationDuration,
        clockState,
        baseMintInfo,
        quoteMintInfo,
        opt
      );
    }
    if (vault.poolType === 1 /* DAMM */) {
      const ammProgram = createDammProgram(connection, opt);
      const pool = await ammProgram.account.pool.fetch(
        vault.pool
      );
      return new AlphaVault(
        program,
        vaultAddress,
        vault,
        pool.bootstrapping.activationPoint,
        pool.bootstrapping.activationType === 0 /* SLOT */ ? new (0, _anchor.BN)(9e3) : new (0, _anchor.BN)(3600),
        clockState,
        baseMintInfo,
        quoteMintInfo,
        opt
      );
    }
    if (vault.poolType === 2 /* DAMMV2 */) {
      const cpAmm = createCpAmmProgram(connection, opt);
      const pool = await cpAmm.account.pool.fetch(vault.pool);
      return new AlphaVault(
        program,
        vaultAddress,
        vault,
        pool.activationPoint,
        pool.activationType === 0 /* SLOT */ ? new (0, _anchor.BN)(9e3) : new (0, _anchor.BN)(3600),
        clockState,
        baseMintInfo,
        quoteMintInfo,
        opt
      );
    }
  }
  /**
   * Creates a customizable FCFS vault
   *
   * @param {Connection} connection - The Solana connection to use.
   * @param {CustomizableFcfsVaultParams} vaultParam - The parameters for creating the vault.
   * @param {PublicKey} owner - The owner of the vault.
   * @param {Opt} [opt] - Optional configuration options.
   * @return {Promise<Transaction>} The transaction for creating the vault.
   */
  static async createCustomizableFcfsVault(connection, vaultParam, owner, opt) {
    const program = createProgram(connection, opt);
    const {
      poolAddress,
      poolType,
      baseMint,
      quoteMint,
      depositingPoint,
      startVestingPoint,
      endVestingPoint,
      maxDepositingCap,
      individualDepositingCap,
      escrowFee,
      whitelistMode
    } = vaultParam;
    const [alphaVault] = deriveAlphaVault(
      owner,
      poolAddress,
      program.programId
    );
    const createTx = await program.methods.initializeFcfsVault({
      poolType,
      baseMint,
      quoteMint,
      depositingPoint,
      startVestingPoint,
      endVestingPoint,
      maxDepositingCap,
      individualDepositingCap,
      escrowFee,
      whitelistMode
    }).accountsPartial({
      base: owner,
      vault: alphaVault,
      pool: poolAddress,
      funder: owner,
      program: program.programId,
      systemProgram: _web3js.SystemProgram.programId
    }).transaction();
    const { blockhash, lastValidBlockHeight } = await program.provider.connection.getLatestBlockhash("confirmed");
    return new (0, _web3js.Transaction)({
      blockhash,
      lastValidBlockHeight,
      feePayer: owner
    }).add(createTx);
  }
  /**
   * Creates a customizable Prorata vault.
   *
   * @param {Connection} connection - The Solana connection to use.
   * @param {CustomizableProrataVaultParams} vaultParam - The parameters for creating the vault.
   * @param {PublicKey} owner - The owner of the vault.
   * @param {Opt} [opt] - Optional configuration options.
   * @return {Promise<Transaction>} The transaction for creating the vault.
   */
  static async createCustomizableProrataVault(connection, vaultParam, owner, opt) {
    const program = createProgram(connection, opt);
    const {
      poolAddress,
      poolType,
      baseMint,
      quoteMint,
      depositingPoint,
      startVestingPoint,
      endVestingPoint,
      maxBuyingCap,
      escrowFee,
      whitelistMode
    } = vaultParam;
    const [alphaVault] = deriveAlphaVault(
      owner,
      poolAddress,
      program.programId
    );
    const createTx = await program.methods.initializeProrataVault({
      poolType,
      baseMint,
      quoteMint,
      depositingPoint,
      startVestingPoint,
      endVestingPoint,
      maxBuyingCap,
      escrowFee,
      whitelistMode
    }).accountsPartial({
      base: owner,
      vault: alphaVault,
      pool: poolAddress,
      funder: owner,
      program: program.programId,
      systemProgram: _web3js.SystemProgram.programId
    }).transaction();
    const { blockhash, lastValidBlockHeight } = await program.provider.connection.getLatestBlockhash("confirmed");
    return new (0, _web3js.Transaction)({
      blockhash,
      lastValidBlockHeight,
      feePayer: owner
    }).add(createTx);
  }
  /**
   * Creates a permissionless vault for dynamic amm / dlmm pool.
   *
   * @param {Connection} connection - The Solana connection to use.
   * @param {VaultParam} params - The vault parameters.
   * @param {PublicKey} owner - The public key of the vault owner.
   * @param {Opt} [opt] - Optional parameters.
   * @return {Promise<Transaction>} The transaction creating the vault.
   */
  static async createPermissionlessVault(connection, vaultParam, owner, opt) {
    const program = createProgram(connection, opt);
    return AlphaVault.createVault(
      program,
      vaultParam,
      owner,
      0 /* Permissionless */
    );
  }
  /**
   * Creates a permissioned vault for dynamic amm / dlmm pool. Vault created with this function will require merkle proof to be passed along when create stake escrow.
   *
   * @param {Connection} connection - The Solana connection to use.
   * @param {VaultParam} params - The vault parameters.
   * @param {PublicKey} owner - The public key of the vault owner.
   * @param {Opt} [opt] - Optional parameters.
   * @return {Promise<Transaction>} The transaction creating the vault.
   */
  static async createPermissionedVaultWithMerkleProof(connection, vaultParam, owner, opt) {
    const program = createProgram(connection, opt);
    return AlphaVault.createVault(
      program,
      vaultParam,
      owner,
      1 /* PermissionWithMerkleProof */
    );
  }
  /**
   * Creates a permissioned vault for dynamic amm / dlmm pool. Vault created with this function will require vault creator to create stake escrow for each users.
   *
   * @param {Connection} connection - The Solana connection to use.
   * @param {VaultParam} params - The vault parameters.
   * @param {PublicKey} owner - The public key of the vault owner.
   * @param {Opt} [opt] - Optional parameters.
   * @return {Promise<Transaction>} The transaction creating the vault.
   */
  static async createPermissionedVaultWithAuthorityFund(connection, vaultParam, owner, opt) {
    const program = createProgram(connection, opt);
    return AlphaVault.createVault(
      program,
      vaultParam,
      owner,
      2 /* PermissionWithAuthority */
    );
  }
  /**
   * Retrieves a list of all FCFS vault configurations.
   *
   * @param {Connection} connection - The Solana connection to use.
   * @param {Opt} [opt] - Optional parameters (e.g., cluster).
   * @return {Promise<fcfsVaultConfig[]>} A promise containing a list of FCFS vault configurations.
   */
  static async getFcfsConfigs(connection, opt) {
    const program = createProgram(connection, opt);
    return program.account.fcfsVaultConfig.all();
  }
  /**
   * Retrieves a list of all prorata vault configurations.
   *
   * @param {Connection} connection - The Solana connection to use.
   * @param {Opt} [opt] - Optional configuration options.
   * @return {Promise<prorataVaultConfig[]>} A promise containing a list of prorata vault configurations.
   */
  static async getProrataConfigs(connection, opt) {
    const program = createProgram(connection, opt);
    return program.account.prorataVaultConfig.all();
  }
  /** End Static Function */
  /** Public Function */
  /**
   * Calculates and returns information about the total allocated, claimed,
   * and claimable tokens in an escrow account based on certain conditions.
   * @param {Escrow} escrowAccount - An object representing an escrow account, which likely contains
   * information such as total deposits, claimed tokens, and other relevant data.
   * @returns The `getClaimInfo` function returns an object with three properties: `totalAllocated`,
   * `totalClaimed`, and `totalClaimable`.
   */
  getClaimInfo(escrowAccount) {
    if (!escrowAccount || this.vault.totalDeposit.lten(0) || this.vault.boughtToken.lten(0)) {
      return {
        totalAllocated: new (0, _anchor.BN)(0),
        totalClaimed: new (0, _anchor.BN)(0),
        totalClaimable: new (0, _anchor.BN)(0)
      };
    }
    const currentSlot = this.clock.slot.toNumber();
    const currentTimestamp = this.clock.unixTimestamp.toNumber();
    const totalAllocated = this.vault.boughtToken.mul(escrowAccount.totalDeposit).div(this.vault.totalDeposit);
    const totalClaimed = escrowAccount.claimedToken;
    const totalClaimable = (() => {
      const currentPoint = new (0, _anchor.BN)(
        this.vault.activationType === 0 /* SLOT */ ? currentSlot : currentTimestamp
      );
      if (currentPoint.lt(this.vault.startVestingPoint)) {
        return new (0, _anchor.BN)(0);
      }
      const endPoint = _anchor.BN.min(currentPoint, this.vault.endVestingPoint);
      const totalClaimableToken = this.vault.boughtToken.mul(endPoint.add(new (0, _anchor.BN)(1)).sub(this.vault.startVestingPoint)).div(
        this.vault.endVestingPoint.add(new (0, _anchor.BN)(1)).sub(this.vault.startVestingPoint)
      );
      const drippedEscrowAmount = totalClaimableToken.mul(escrowAccount.totalDeposit).div(this.vault.totalDeposit);
      return drippedEscrowAmount.sub(escrowAccount.claimedToken);
    })();
    return {
      totalAllocated,
      totalClaimed,
      totalClaimable
    };
  }
  /**
   * The available deposit quota of the vault based on user's deposit info
   * @param {escrow} Escrow - The `depositInfo` object can obtain from the `getEscrow` function.
   * @param {merkleProof} DepositWithProofParams - The `merkleProof` object can be obtain from API by our dev.
   * @returns The `getAvailableDepositQuota` function returns the available deposit quota in lamports
   */
  getAvailableDepositQuota(escrow, merkleProof) {
    const deposited = _nullishCoalesce(_optionalChain([escrow, 'optionalAccess', _14 => _14.totalDeposit]), () => ( new (0, _anchor.BN)(0)));
    let remainingQuota = new (0, _anchor.BN)(Number.MAX_SAFE_INTEGER);
    if (this.vault.whitelistMode == 0 /* Permissionless */) {
      if (this.mode === 1 /* FCFS */) {
        remainingQuota = this.vault.individualDepositingCap.sub(deposited);
      }
    } else if (this.vault.whitelistMode == 1 /* PermissionWithMerkleProof */) {
      remainingQuota = merkleProof ? merkleProof.maxCap.sub(deposited) : new (0, _anchor.BN)(0);
    } else if (this.vault.whitelistMode == 2 /* PermissionWithAuthority */) {
      remainingQuota = escrow ? escrow.maxCap.sub(deposited) : new (0, _anchor.BN)(0);
    }
    let vaultCap = new (0, _anchor.BN)(Number.MAX_SAFE_INTEGER);
    if (this.mode === 1 /* FCFS */) {
      vaultCap = this.vault.maxDepositingCap.sub(this.vault.totalDeposit);
    }
    return _anchor.BN.min(remainingQuota, vaultCap);
  }
  async interactionState(escrow, merkleProof, clock) {
    await this.refreshState(clock);
    const claimInfo = this.getClaimInfo(escrow);
    const depositInfo = this.getDepositInfo(escrow);
    const availableQuota = this.getAvailableDepositQuota(escrow, merkleProof);
    const isWhitelisted = this.isWhitelisted(escrow, merkleProof);
    const canClaim = this.canClaim(escrow);
    const hadClaimed = escrow ? escrow.claimedToken.gtn(0) : false;
    const canDeposit = this.canDeposit(escrow, merkleProof);
    const hadDeposited = escrow ? escrow.totalDeposit.gtn(0) : false;
    const canWithdraw = this.canWithdraw(escrow);
    const canWithdrawDepositOverflow = this.canWithdrawDepositOverflow(escrow);
    const availableDepositOverflow = this.escrowAvailableDepositOverflowAmount(escrow);
    const canWithdrawRemainingQuote = this.canWithdrawRemainingQuote(escrow);
    const hadWithdrawnRemainingQuote = this.hadWithdrawnRemainingQuote(escrow);
    return {
      claimInfo,
      depositInfo,
      availableQuota,
      isWhitelisted,
      canClaim,
      hadClaimed,
      canDeposit,
      hadDeposited,
      canWithdraw,
      canWithdrawDepositOverflow,
      availableDepositOverflow,
      canWithdrawRemainingQuote,
      hadWithdrawnRemainingQuote
    };
  }
  isWhitelisted(escrow, merkleProof) {
    if (this.vault.whitelistMode === 1 /* PermissionWithMerkleProof */)
      return !!merkleProof;
    if (this.vault.whitelistMode === 2 /* PermissionWithAuthority */)
      return !!escrow;
    return true;
  }
  canClaim(escrow) {
    if (!escrow)
      return false;
    if (![4 /* VESTING */, 5 /* ENDED */].includes(this.vaultState)) {
      return false;
    }
    const claimInfo = this.getClaimInfo(escrow);
    return claimInfo.totalClaimable.gtn(0);
  }
  canDeposit(escrow, merkleProof) {
    if (!this.isWhitelisted(escrow, merkleProof)) {
      return false;
    }
    if (this.vaultState !== 1 /* DEPOSITING */) {
      return false;
    }
    const personalAvailableCap = this.getAvailableDepositQuota(
      escrow,
      merkleProof
    );
    if (personalAvailableCap.lten(0)) {
      return false;
    }
    return true;
  }
  canWithdraw(escrow) {
    if (!escrow)
      return false;
    if (escrow.totalDeposit.gtn(0) && this.mode === 0 /* PRORATA */ && this.vaultState === 1 /* DEPOSITING */) {
      return true;
    }
    return false;
  }
  canWithdrawDepositOverflow(escrow) {
    if (!escrow)
      return false;
    const currentPoint = this.vault.activationType === 0 /* SLOT */ ? this.clock.slot.toNumber() : this.clock.unixTimestamp.toNumber();
    const escrowAvailableDepositOverflowAmount = this.escrowAvailableDepositOverflowAmount(escrow);
    return currentPoint > this.vaultPoint.lastJoinPoint && currentPoint <= this.vaultPoint.lastBuyingPoint && escrowAvailableDepositOverflowAmount.gt(new (0, _anchor.BN)(0));
  }
  escrowAvailableDepositOverflowAmount(escrow) {
    if (!escrow || this.vault.vaultMode == 1 /* FCFS */ || this.vault.totalDeposit.isZero())
      return new (0, _anchor.BN)(0);
    const vaultDepositOverflow = this.vault.totalDeposit.gt(
      this.vault.maxBuyingCap
    ) ? this.vault.totalDeposit.sub(this.vault.maxBuyingCap) : new (0, _anchor.BN)(0);
    const escrowDepositOverflow = vaultDepositOverflow.mul(escrow.totalDeposit).div(this.vault.totalDeposit);
    return escrowDepositOverflow.sub(escrow.withdrawnDepositOverflow);
  }
  canWithdrawRemainingQuote(escrow) {
    if (!escrow)
      return false;
    const currentPoint = this.vault.activationType === 0 /* SLOT */ ? this.clock.slot.toNumber() : this.clock.unixTimestamp.toNumber();
    const remainingQuoteAmount = this.vault.totalDeposit.sub(
      this.vault.swappedAmount
    );
    return currentPoint > this.vaultPoint.lastBuyingPoint && remainingQuoteAmount.gt(new (0, _anchor.BN)(0)) && escrow.refunded === 0;
  }
  hadWithdrawnRemainingQuote(escrow) {
    if (!escrow)
      return false;
    return escrow.refunded === 1;
  }
  /**
   * Refreshes the state of the Alpha Vault by fetching the latest vault data.
   *
   * @return {void} No return value, updates the internal state of the Alpha Vault.
   */
  async refreshState(clock) {
    if (clock) {
      this.vault = await this.program.account.vault.fetch(this.pubkey);
      this.clock = clock;
    } else {
      const accountsToFetch = [this.pubkey, _web3js.SYSVAR_CLOCK_PUBKEY];
      const [vaultAccountBuffer, clockAccountBuffer] = await this.program.provider.connection.getMultipleAccountsInfo(
        accountsToFetch
      );
      const vault = this.program.coder.accounts.decode(
        "vault",
        vaultAccountBuffer.data
      );
      const clockState = ClockLayout.decode(clockAccountBuffer.data);
      this.vault = vault;
      this.clock = clockState;
    }
  }
  /**
   * Retrieves the escrow account associated with the given owner.
   *
   * @param {PublicKey} owner - The public key of the owner.
   * @return {Promise<Escrow | null>} A promise containing the escrow account, or null if not found.
   */
  async getEscrow(owner) {
    const [escrow] = deriveEscrow(this.pubkey, owner, this.program.programId);
    const escrowAccount = await this.program.account.escrow.fetchNullable(escrow);
    return escrowAccount;
  }
  /**
   * Creates a stake escrow account by vault authority. Only applicable with PermissionWithAuthority whitelist mode
   *
   * @param {BN} maxAmount - The maximum amount for the escrow.
   * @param {PublicKey} owner - The public key of the owner.
   * @param {PublicKey} vaultAuthority - The public key of the vault authority.
   * @return {Promise<Transaction>} A promise that resolves to the transaction for creating a stake escrow.
   */
  async createStakeEscrowByAuthority(maxAmount, owner, vaultAuthority) {
    const [escrow] = deriveEscrow(this.pubkey, owner, this.program.programId);
    const createStakeEscrowIx = await this.program.methods.createPermissionedEscrowWithAuthority(maxAmount).accountsPartial({
      vault: this.pubkey,
      pool: this.vault.pool,
      escrow,
      owner,
      payer: vaultAuthority
    }).instruction();
    const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
    return new (0, _web3js.Transaction)({
      blockhash,
      lastValidBlockHeight,
      feePayer: vaultAuthority
    }).add(createStakeEscrowIx);
  }
  /**
   * Creates a stake escrow account by vault authority. Only applicable with PermissionWithAuthority whitelist mode
   *
   * @param {BN} maxAmount - The maximum amount for the escrow.
   * @param {PublicKey[]} owners - The public key of the owners.
   * @param {PublicKey} vaultAuthority - The public key of the vault authority.
   * @return {Promise<Transaction>} A promise that resolves to the transaction for creating a stake escrow.
   */
  async createMultipleStakeEscrowByAuthorityInstructions(walletDepositCap, vaultAuthority) {
    return Promise.all(
      walletDepositCap.map((individualCap) => {
        const owner = individualCap.address;
        const maxAmount = individualCap.maxAmount;
        const [escrow] = deriveEscrow(
          this.pubkey,
          owner,
          this.program.programId
        );
        return this.program.methods.createPermissionedEscrowWithAuthority(maxAmount).accountsPartial({
          vault: this.pubkey,
          pool: this.vault.pool,
          escrow,
          owner,
          payer: vaultAuthority
        }).instruction();
      })
    );
  }
  /**
   * Deposits a specified amount of tokens into the vault.
   *
   * @param {BN} maxAmount - The maximum amount of tokens to deposit.
   * @param {PublicKey} owner - The public key of the owner's wallet.
   * @param {DepositWithProofParams} [depositProof] - The deposit proof parameters. Required for permisisoned vault.
   * @return {Promise<Transaction>} A promise that resolves to the deposit transaction.
   */
  async deposit(maxAmount, owner, merkleProof) {
    if (this.vault.whitelistMode === 1 /* PermissionWithMerkleProof */) {
      if (!merkleProof) {
        throw new Error(
          "Merkle proof is required for permissioned vault with merkle proof"
        );
      }
    }
    const [escrow] = deriveEscrow(this.pubkey, owner, this.program.programId);
    const escrowAccount = await this.program.account.escrow.fetchNullable(escrow);
    const preInstructions = [];
    if (!escrowAccount) {
      if (this.vault.whitelistMode === 1 /* PermissionWithMerkleProof */) {
        const { merkleRootConfig, maxCap, proof } = merkleProof;
        const createEscrowTx = await this.program.methods.createPermissionedEscrow(maxCap, proof).accountsPartial({
          merkleRootConfig,
          vault: this.pubkey,
          pool: this.vault.pool,
          escrow,
          owner,
          payer: owner,
          systemProgram: _web3js.SystemProgram.programId,
          escrowFeeReceiver: ALPHA_VAULT_TREASURY_ID
        }).instruction();
        preInstructions.push(createEscrowTx);
      } else if (this.vault.whitelistMode === 0 /* Permissionless */) {
        const createEscrowTx = await this.program.methods.createNewEscrow().accountsPartial({
          vault: this.pubkey,
          escrow,
          owner,
          payer: owner,
          systemProgram: _web3js.SystemProgram.programId,
          pool: this.vault.pool,
          escrowFeeReceiver: ALPHA_VAULT_TREASURY_ID
        }).instruction();
        preInstructions.push(createEscrowTx);
      }
    }
    const [
      { ataPubKey: sourceToken, ix: createSourceTokenIx },
      { ix: createBaseTokenIx },
      { ix: createTokenVaultIx }
    ] = await Promise.all([
      getOrCreateATAInstruction(
        this.program.provider.connection,
        this.vault.quoteMint,
        owner,
        owner,
        this.quoteMintInfo.tokenProgram
      ),
      getOrCreateATAInstruction(
        this.program.provider.connection,
        this.vault.baseMint,
        owner,
        owner,
        this.baseMintInfo.tokenProgram
      ),
      getOrCreateATAInstruction(
        this.program.provider.connection,
        this.vault.quoteMint,
        this.pubkey,
        owner,
        this.quoteMintInfo.tokenProgram
      )
    ]);
    createSourceTokenIx && preInstructions.push(createSourceTokenIx);
    createBaseTokenIx && preInstructions.push(createBaseTokenIx);
    createTokenVaultIx && preInstructions.push(createTokenVaultIx);
    const postInstructions = [];
    if (this.vault.quoteMint.equals(_spltoken.NATIVE_MINT)) {
      preInstructions.push(
        ...wrapSOLInstruction(owner, sourceToken, BigInt(maxAmount.toString()))
      );
      postInstructions.push(unwrapSOLInstruction(owner));
    }
    const depositTx = await this.program.methods.deposit(maxAmount).accountsPartial({
      vault: this.pubkey,
      escrow,
      sourceToken,
      tokenVault: this.vault.tokenVault,
      tokenMint: this.vault.quoteMint,
      pool: this.vault.pool,
      owner,
      tokenProgram: this.quoteMintInfo.tokenProgram
    }).preInstructions(preInstructions).postInstructions(postInstructions).transaction();
    const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
    return new (0, _web3js.Transaction)({
      blockhash,
      lastValidBlockHeight,
      feePayer: owner
    }).add(depositTx);
  }
  /**
   * Withdraws a specified amount of tokens from the vault.
   *
   * @param {BN} amount - The amount of tokens to withdraw.
   * @param {PublicKey} owner - The public key of the owner's wallet.
   * @return {Promise<Transaction>} A promise that resolves to the withdraw transaction.
   */
  async withdraw(amount, owner) {
    const [escrow] = deriveEscrow(this.pubkey, owner, this.program.programId);
    const preInstructions = [];
    const { ataPubKey: destinationToken, ix: createDestinationTokenIx } = await getOrCreateATAInstruction(
      this.program.provider.connection,
      this.vault.quoteMint,
      owner,
      owner,
      this.quoteMintInfo.tokenProgram
    );
    createDestinationTokenIx && preInstructions.push(createDestinationTokenIx);
    const postInstructions = [];
    if (this.vault.quoteMint.equals(_spltoken.NATIVE_MINT)) {
      preInstructions.push(
        ...wrapSOLInstruction(
          owner,
          destinationToken,
          BigInt(amount.toString())
        )
      );
      postInstructions.push(unwrapSOLInstruction(owner));
    }
    const withdrawTx = await this.program.methods.withdraw(amount).accountsPartial({
      vault: this.pubkey,
      destinationToken,
      escrow,
      owner,
      pool: this.vault.pool,
      tokenVault: this.vault.tokenVault,
      tokenMint: this.vault.quoteMint,
      tokenProgram: this.quoteMintInfo.tokenProgram
    }).preInstructions(preInstructions).transaction();
    const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
    return new (0, _web3js.Transaction)({
      blockhash,
      lastValidBlockHeight,
      feePayer: owner
    }).add(withdrawTx);
  }
  /**
   * Withdraws the remaining quote from the vault.
   *
   * @param {PublicKey} owner - The public key of the owner's wallet.
   * @return {Promise<Transaction>} A promise that resolves to the withdraw transaction.
   */
  async withdrawRemainingQuote(owner) {
    const [escrow] = deriveEscrow(this.pubkey, owner, this.program.programId);
    const preInstructions = [];
    const { ataPubKey: destinationToken, ix: createDestinationTokenIx } = await getOrCreateATAInstruction(
      this.program.provider.connection,
      this.vault.quoteMint,
      owner,
      owner,
      this.quoteMintInfo.tokenProgram
    );
    createDestinationTokenIx && preInstructions.push(createDestinationTokenIx);
    const withdrawRemainingTx = await this.program.methods.withdrawRemainingQuote().accountsPartial({
      vault: this.pubkey,
      escrow,
      owner,
      destinationToken,
      pool: this.vault.pool,
      tokenVault: this.vault.tokenVault,
      tokenMint: this.vault.quoteMint,
      tokenProgram: this.quoteMintInfo.tokenProgram
    }).preInstructions(preInstructions).transaction();
    const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
    return new (0, _web3js.Transaction)({
      blockhash,
      lastValidBlockHeight,
      feePayer: owner
    }).add(withdrawRemainingTx);
  }
  /**
   * Claims bought token from the vault.
   *
   * @param {PublicKey} owner - The public key of the owner's wallet.
   * @return {Promise<Transaction>} A promise that resolves to the claim transaction.
   */
  async claimToken(owner) {
    const [escrow] = deriveEscrow(this.pubkey, owner, this.program.programId);
    const preInstructions = [];
    const { ataPubKey: destinationToken, ix: createDestinationTokenIx } = await getOrCreateATAInstruction(
      this.program.provider.connection,
      this.vault.baseMint,
      owner,
      owner,
      this.baseMintInfo.tokenProgram
    );
    createDestinationTokenIx && preInstructions.push(createDestinationTokenIx);
    const claimTokenTx = await this.program.methods.claimToken().accountsPartial({
      vault: this.pubkey,
      escrow,
      owner,
      destinationToken,
      tokenOutVault: this.vault.tokenOutVault,
      tokenMint: this.vault.baseMint,
      tokenProgram: this.baseMintInfo.tokenProgram
    }).preInstructions(preInstructions).transaction();
    const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
    return new (0, _web3js.Transaction)({
      blockhash,
      lastValidBlockHeight,
      feePayer: owner
    }).add(claimTokenTx);
  }
  /**
   * Crank the vault to buy tokens from the pool.
   *
   * @param {PublicKey} payer - The public key of the payer's wallet.
   *
   * @returns {Promise<Transaction | null>} A promise that resolves to the fill vault transaction or null if it's DLMM pool and out of liquidity.
   */
  async fillVault(payer) {
    const poolType = this.vault.poolType;
    if (poolType === 1 /* DAMM */) {
      return fillDammTransaction(this.program, this.pubkey, this.vault, payer);
    } else if (poolType === 2 /* DAMMV2 */) {
      return fillDammV2Transaction(this.program, this.pubkey, this.vault, payer);
    } else {
      return fillDlmmTransaction(
        this.program,
        this.pubkey,
        this.vault,
        payer,
        this.opt
      );
    }
  }
  /**
   * Creates a Merkle root configuration for the vault.
   *
   * @param {Buffer} root - The Merkle root to be configured.
   * @param {BN} version - The version of the Merkle root configuration.
   * @return {Transaction} A transaction to create the Merkle root configuration.
   */
  async createMerkleRootConfig(root, version, vaultCreator) {
    const [merkleRootConfig] = deriveMerkleRootConfig(
      this.pubkey,
      version,
      this.program.programId
    );
    return this.program.methods.createMerkleRootConfig({
      root: Array.from(new Uint8Array(root)),
      version
    }).accountsPartial({
      merkleRootConfig,
      vault: this.pubkey,
      admin: vaultCreator,
      systemProgram: _web3js.SystemProgram.programId
    }).transaction();
  }
  /**
   * Creates a Merkle proof metadata for the vault.
   *
   * @param {PublicKey} vaultCreator - The public key of the creator's wallet.
   * @param {string} proofUrl - The URL pointing to the Merkle proof data.
   * @return {Promise<Transaction>} A promise that resolves to the transaction for creating the Merkle proof metadata.
   */
  async createMerkleProofMetadata(vaultCreator, proofUrl) {
    const [merkleProofMetadata] = deriveMerkleProofMetadata(
      this.pubkey,
      this.program.programId
    );
    const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
    const createMerkleProofMetadataTx = await this.program.methods.createMerkleProofMetadata(proofUrl).accountsPartial({
      merkleProofMetadata,
      vault: this.pubkey,
      admin: vaultCreator,
      systemProgram: _web3js.SystemProgram.programId
    }).transaction();
    return new (0, _web3js.Transaction)({
      blockhash,
      lastValidBlockHeight,
      feePayer: vaultCreator
    }).add(createMerkleProofMetadataTx);
  }
  /**
   * Retrieves the URL of the Merkle proof data associated with the vault.
   *
   * @return {Promise<string>} A promise that resolves to the URL of the Merkle proof data.
   */
  async getMerkleProofUrl() {
    const [merkleProofMetadata] = deriveMerkleProofMetadata(
      this.pubkey,
      this.program.programId
    );
    const merkleProofMetadataState = await this.program.account.merkleProofMetadata.fetchNullable(
      merkleProofMetadata
    );
    return merkleProofMetadataState ? merkleProofMetadataState.proofUrl : MERKLE_PROOF_API[this.opt.cluster || "mainnet-beta"];
  }
  /**
   * Retrieves the Merkle proof data required for depositing into the vault.
   * The data is fetched from the URL stored in the vault's Merkle proof metadata.
   *
   * @param {PublicKey} owner - The public key of the depositor's wallet.
   * @return {Promise<DepositWithProofParams | null>} A promise that resolves to the Merkle proof data if it exists, or null otherwise.
   */
  async getMerkleProofForDeposit(owner) {
    let baseUrl = await this.getMerkleProofUrl();
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    const fullUrl = `${baseUrl}/${this.pubkey.toBase58()}/${owner.toBase58()}`;
    try {
      const response = await fetch(fullUrl);
      if (response.ok) {
        const data = await response.json();
        return {
          merkleRootConfig: new (0, _web3js.PublicKey)(data.merkle_root_config),
          maxCap: new (0, _anchor.BN)(data.max_cap),
          proof: data.proof
        };
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }
  /**
   * Closes the Merkle proof metadata for the vault.
   *
   * @param {PublicKey} vaultCreator - The public key of the creator's wallet.
   * @return {Promise<Transaction>} A promise that resolves to the transaction for closing the Merkle proof metadata.
   */
  async closeMerkleProofMetadata(vaultCreator) {
    const [merkleProofMetadata] = deriveMerkleProofMetadata(
      this.pubkey,
      this.program.programId
    );
    const closeMerkleProofMetadataTx = await this.program.methods.closeMerkleProofMetadata().accountsPartial({
      merkleProofMetadata,
      vault: this.pubkey,
      rentReceiver: vaultCreator,
      admin: vaultCreator
    }).transaction();
    const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
    return new (0, _web3js.Transaction)({
      blockhash,
      lastValidBlockHeight,
      feePayer: vaultCreator
    }).add(closeMerkleProofMetadataTx);
  }
  /**
   * Close the escrow account.
   *
   * @param {PublicKey} owner - The public key of the owner's wallet.
   * @return {Promise<Transaction>} A promise that resolves to the close escrow transaction.
   */
  async closeEscrow(owner) {
    const [escrow] = deriveEscrow(this.pubkey, owner, this.program.programId);
    const closeEscrowTx = await this.program.methods.closeEscrow().accountsPartial({
      vault: this.pubkey,
      escrow,
      owner,
      rentReceiver: owner
    }).transaction();
    const { blockhash, lastValidBlockHeight } = await this.program.provider.connection.getLatestBlockhash("confirmed");
    return new (0, _web3js.Transaction)({
      blockhash,
      lastValidBlockHeight,
      feePayer: owner
    }).add(closeEscrowTx);
  }
  /**
   * Retrieves deposit information for the given escrow account.
   *
   * @param {Escrow | null} escrowAccount - The escrow account to retrieve deposit information for.
   * @return {Promise<DepositInfo>} A promise that resolves to the deposit information, including total deposit, total filled, and total returned.
   */
  getDepositInfo(escrowAccount) {
    if (!escrowAccount || this.vault.totalDeposit.isZero()) {
      return {
        totalDeposit: new (0, _anchor.BN)(0),
        totalFilled: new (0, _anchor.BN)(0),
        totalReturned: new (0, _anchor.BN)(0)
      };
    }
    const remainingAmount = this.vault.totalDeposit.sub(
      this.vault.swappedAmount
    );
    const hasCrankDurationFinished = [
      3 /* LOCKING */,
      4 /* VESTING */,
      5 /* ENDED */
    ].includes(this.vaultState);
    const totalReturned = hasCrankDurationFinished ? remainingAmount.mul(escrowAccount.totalDeposit).div(this.vault.totalDeposit) : new (0, _anchor.BN)(0);
    const totalFilled = hasCrankDurationFinished ? escrowAccount.totalDeposit.sub(totalReturned) : new (0, _anchor.BN)(0);
    return {
      totalDeposit: escrowAccount.totalDeposit,
      totalFilled,
      totalReturned
    };
  }
  static async createVault(program, {
    quoteMint,
    baseMint,
    poolType,
    vaultMode,
    poolAddress,
    config
  }, owner, whitelistMode) {
    const [alphaVault] = deriveAlphaVault(
      config,
      poolAddress,
      program.programId
    );
    const method = vaultMode === 0 /* PRORATA */ ? program.methods.initializeVaultWithProrataConfig : program.methods.initializeVaultWithFcfsConfig;
    const createTx = await method({
      poolType,
      baseMint,
      quoteMint,
      whitelistMode
    }).accountsPartial({
      vault: alphaVault,
      pool: poolAddress,
      funder: owner,
      config,
      quoteMint,
      program: program.programId,
      systemProgram: _web3js.SystemProgram.programId
    }).transaction();
    const { blockhash, lastValidBlockHeight } = await program.provider.connection.getLatestBlockhash("confirmed");
    return new (0, _web3js.Transaction)({
      blockhash,
      lastValidBlockHeight,
      feePayer: owner
    }).add(createTx);
  }
  /**
   * Retrieves a list of all escrows by owner
   *
   * @param {Connection} connection - The Solana connection to use.
   * @param {PublicKey} owner - The owner of escrows.
   * @param {Opt} [opt] - Optional configuration options.
   * @return {Promise<Esrow[]>} A promise containing a list of escrow
   */
  static async getEscrowByOwner(connection, owner, opt) {
    const program = createProgram(connection, opt);
    return program.account.escrow.all([
      {
        memcmp: {
          bytes: owner.toBase58(),
          offset: 40
        }
      }
    ]);
  }
  /** End Public Function */
};

// ../idls/alpha_vault.json
var alpha_vault_default2 = {
  address: "vaU6kP7iNEGkbmPkLmZfGwiGxd4Mob24QQCie5R9kd2",
  metadata: {
    name: "alpha_vault",
    version: "0.4.1",
    spec: "0.1.0",
    description: "Created with Anchor"
  },
  instructions: [
    {
      name: "claim_token",
      discriminator: [116, 206, 27, 191, 166, 19, 0, 73],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: ["escrow"]
        },
        {
          name: "escrow",
          writable: true
        },
        {
          name: "token_out_vault",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "destination_token",
          writable: true
        },
        {
          name: "token_mint"
        },
        {
          name: "token_program"
        },
        {
          name: "owner",
          signer: true,
          relations: ["escrow"]
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "close_crank_fee_whitelist",
      discriminator: [189, 166, 73, 241, 81, 12, 246, 170],
      accounts: [
        {
          name: "crank_fee_whitelist",
          writable: true
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "rent_receiver",
          writable: true
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "close_escrow",
      discriminator: [139, 171, 94, 146, 191, 91, 144, 50],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: ["escrow"]
        },
        {
          name: "escrow",
          writable: true
        },
        {
          name: "owner",
          signer: true,
          relations: ["escrow"]
        },
        {
          name: "rent_receiver",
          writable: true
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "close_fcfs_config",
      discriminator: [48, 178, 212, 101, 23, 138, 233, 90],
      accounts: [
        {
          name: "config",
          writable: true
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "rent_receiver",
          writable: true
        }
      ],
      args: []
    },
    {
      name: "close_merkle_proof_metadata",
      discriminator: [23, 52, 170, 30, 252, 47, 100, 129],
      accounts: [
        {
          name: "vault",
          relations: ["merkle_proof_metadata"]
        },
        {
          name: "merkle_proof_metadata",
          writable: true
        },
        {
          name: "admin",
          signer: true
        },
        {
          name: "rent_receiver",
          writable: true
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "close_prorata_config",
      discriminator: [84, 140, 103, 57, 178, 155, 57, 26],
      accounts: [
        {
          name: "config",
          writable: true
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "rent_receiver",
          writable: true
        }
      ],
      args: []
    },
    {
      name: "create_crank_fee_whitelist",
      discriminator: [120, 91, 25, 162, 211, 27, 100, 199],
      accounts: [
        {
          name: "crank_fee_whitelist",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  99,
                  114,
                  97,
                  110,
                  107,
                  95,
                  102,
                  101,
                  101,
                  95,
                  119,
                  104,
                  105,
                  116,
                  101,
                  108,
                  105,
                  115,
                  116
                ]
              },
              {
                kind: "account",
                path: "cranker"
              }
            ]
          }
        },
        {
          name: "cranker"
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "create_fcfs_config",
      discriminator: [7, 255, 242, 242, 1, 99, 179, 12],
      accounts: [
        {
          name: "config",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [102, 99, 102, 115, 95, 99, 111, 110, 102, 105, 103]
              },
              {
                kind: "arg",
                path: "config_parameters.index"
              }
            ]
          }
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        }
      ],
      args: [
        {
          name: "config_parameters",
          type: {
            defined: {
              name: "FcfsConfigParameters"
            }
          }
        }
      ]
    },
    {
      name: "create_merkle_proof_metadata",
      discriminator: [151, 46, 163, 52, 181, 178, 47, 227],
      accounts: [
        {
          name: "vault"
        },
        {
          name: "merkle_proof_metadata",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  109,
                  101,
                  114,
                  107,
                  108,
                  101,
                  95,
                  112,
                  114,
                  111,
                  111,
                  102,
                  95,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                kind: "account",
                path: "vault"
              }
            ]
          }
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "proof_url",
          type: "string"
        }
      ]
    },
    {
      name: "create_merkle_root_config",
      discriminator: [55, 243, 253, 240, 78, 186, 232, 166],
      accounts: [
        {
          name: "vault"
        },
        {
          name: "merkle_root_config",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [109, 101, 114, 107, 108, 101, 95, 114, 111, 111, 116]
              },
              {
                kind: "account",
                path: "vault"
              },
              {
                kind: "arg",
                path: "params.version"
              }
            ]
          }
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "CreateMerkleRootConfigParams"
            }
          }
        }
      ]
    },
    {
      name: "create_new_escrow",
      discriminator: [60, 154, 170, 202, 252, 109, 83, 199],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "pool",
          relations: ["vault"]
        },
        {
          name: "escrow",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [101, 115, 99, 114, 111, 119]
              },
              {
                kind: "account",
                path: "vault"
              },
              {
                kind: "account",
                path: "owner"
              }
            ]
          }
        },
        {
          name: "owner"
        },
        {
          name: "payer",
          writable: true,
          signer: true
        },
        {
          name: "escrow_fee_receiver",
          writable: true,
          optional: true,
          address: "BJQbRiRWhJCyTYZcAuAL3ngDCx3AyFQGKDq8zhiZAKUw"
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    },
    {
      name: "create_permissioned_escrow",
      discriminator: [60, 166, 36, 85, 96, 137, 132, 184],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: ["merkle_root_config"]
        },
        {
          name: "pool",
          relations: ["vault"]
        },
        {
          name: "escrow",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [101, 115, 99, 114, 111, 119]
              },
              {
                kind: "account",
                path: "vault"
              },
              {
                kind: "account",
                path: "owner"
              }
            ]
          }
        },
        {
          name: "owner"
        },
        {
          name: "merkle_root_config",
          docs: ["merkle_root_config"]
        },
        {
          name: "payer",
          writable: true,
          signer: true
        },
        {
          name: "escrow_fee_receiver",
          writable: true,
          optional: true,
          address: "BJQbRiRWhJCyTYZcAuAL3ngDCx3AyFQGKDq8zhiZAKUw"
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_cap",
          type: "u64"
        },
        {
          name: "proof",
          type: {
            vec: {
              array: ["u8", 32]
            }
          }
        }
      ]
    },
    {
      name: "create_permissioned_escrow_with_authority",
      discriminator: [211, 231, 194, 69, 65, 11, 123, 93],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "pool",
          relations: ["vault"]
        },
        {
          name: "escrow",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [101, 115, 99, 114, 111, 119]
              },
              {
                kind: "account",
                path: "vault"
              },
              {
                kind: "account",
                path: "owner"
              }
            ]
          }
        },
        {
          name: "owner"
        },
        {
          name: "payer",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_cap",
          type: "u64"
        }
      ]
    },
    {
      name: "create_prorata_config",
      discriminator: [38, 203, 72, 231, 103, 29, 195, 61],
      accounts: [
        {
          name: "config",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  112,
                  114,
                  111,
                  114,
                  97,
                  116,
                  97,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                kind: "arg",
                path: "config_parameters.index"
              }
            ]
          }
        },
        {
          name: "admin",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        }
      ],
      args: [
        {
          name: "config_parameters",
          type: {
            defined: {
              name: "ProrataConfigParameters"
            }
          }
        }
      ]
    },
    {
      name: "deposit",
      discriminator: [242, 35, 198, 137, 82, 225, 242, 182],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: ["escrow"]
        },
        {
          name: "pool",
          relations: ["vault"]
        },
        {
          name: "escrow",
          writable: true
        },
        {
          name: "source_token",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "token_mint"
        },
        {
          name: "token_program"
        },
        {
          name: "owner",
          signer: true,
          relations: ["escrow"]
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_amount",
          type: "u64"
        }
      ]
    },
    {
      name: "fill_damm_v2",
      discriminator: [221, 175, 108, 48, 19, 204, 125, 23],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "token_out_vault",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "amm_program",
          address: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
        },
        {
          name: "pool_authority"
        },
        {
          name: "pool",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "token_a_vault",
          writable: true
        },
        {
          name: "token_b_vault",
          writable: true
        },
        {
          name: "token_a_mint"
        },
        {
          name: "token_b_mint"
        },
        {
          name: "token_a_program"
        },
        {
          name: "token_b_program"
        },
        {
          name: "damm_event_authority"
        },
        {
          name: "crank_fee_whitelist",
          optional: true
        },
        {
          name: "crank_fee_receiver",
          writable: true,
          optional: true,
          address: "BJQbRiRWhJCyTYZcAuAL3ngDCx3AyFQGKDq8zhiZAKUw"
        },
        {
          name: "cranker",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_amount",
          type: "u64"
        }
      ]
    },
    {
      name: "fill_dlmm",
      discriminator: [1, 108, 141, 11, 4, 126, 251, 222],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "token_out_vault",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "amm_program",
          address: "LbVRzDTvBDEcrthxfZ4RL6yiq3uZw8bS6MwtdY6UhFQ"
        },
        {
          name: "pool",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "bin_array_bitmap_extension"
        },
        {
          name: "reserve_x",
          writable: true
        },
        {
          name: "reserve_y",
          writable: true
        },
        {
          name: "token_x_mint"
        },
        {
          name: "token_y_mint"
        },
        {
          name: "oracle",
          writable: true
        },
        {
          name: "token_x_program"
        },
        {
          name: "token_y_program"
        },
        {
          name: "dlmm_event_authority"
        },
        {
          name: "crank_fee_whitelist",
          optional: true
        },
        {
          name: "crank_fee_receiver",
          writable: true,
          optional: true,
          address: "BJQbRiRWhJCyTYZcAuAL3ngDCx3AyFQGKDq8zhiZAKUw"
        },
        {
          name: "cranker",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "memo_program"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_amount",
          type: "u64"
        },
        {
          name: "remaining_accounts_info",
          type: {
            defined: {
              name: "RemainingAccountsInfo"
            }
          }
        }
      ]
    },
    {
      name: "fill_dynamic_amm",
      discriminator: [224, 226, 223, 80, 36, 50, 70, 231],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "token_out_vault",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "amm_program",
          address: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB"
        },
        {
          name: "pool",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "a_vault",
          writable: true
        },
        {
          name: "b_vault",
          writable: true
        },
        {
          name: "a_token_vault",
          writable: true
        },
        {
          name: "b_token_vault",
          writable: true
        },
        {
          name: "a_vault_lp_mint",
          writable: true
        },
        {
          name: "b_vault_lp_mint",
          writable: true
        },
        {
          name: "a_vault_lp",
          writable: true
        },
        {
          name: "b_vault_lp",
          writable: true
        },
        {
          name: "admin_token_fee",
          writable: true
        },
        {
          name: "vault_program"
        },
        {
          name: "token_program"
        },
        {
          name: "crank_fee_whitelist",
          optional: true
        },
        {
          name: "crank_fee_receiver",
          writable: true,
          optional: true,
          address: "BJQbRiRWhJCyTYZcAuAL3ngDCx3AyFQGKDq8zhiZAKUw"
        },
        {
          name: "cranker",
          writable: true,
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "max_amount",
          type: "u64"
        }
      ]
    },
    {
      name: "initialize_fcfs_vault",
      discriminator: [163, 205, 69, 145, 235, 71, 47, 21],
      accounts: [
        {
          name: "vault",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [118, 97, 117, 108, 116]
              },
              {
                kind: "account",
                path: "base"
              },
              {
                kind: "account",
                path: "pool"
              }
            ]
          }
        },
        {
          name: "pool"
        },
        {
          name: "funder",
          writable: true,
          signer: true
        },
        {
          name: "base",
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "InitializeFcfsVaultParams"
            }
          }
        }
      ]
    },
    {
      name: "initialize_prorata_vault",
      discriminator: [178, 180, 176, 247, 128, 186, 43, 9],
      accounts: [
        {
          name: "vault",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [118, 97, 117, 108, 116]
              },
              {
                kind: "account",
                path: "base"
              },
              {
                kind: "account",
                path: "pool"
              }
            ]
          }
        },
        {
          name: "pool"
        },
        {
          name: "funder",
          writable: true,
          signer: true
        },
        {
          name: "base",
          signer: true
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "InitializeProrataVaultParams"
            }
          }
        }
      ]
    },
    {
      name: "initialize_vault_with_fcfs_config",
      discriminator: [189, 251, 92, 104, 235, 21, 81, 182],
      accounts: [
        {
          name: "vault",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [118, 97, 117, 108, 116]
              },
              {
                kind: "account",
                path: "config"
              },
              {
                kind: "account",
                path: "pool"
              }
            ]
          }
        },
        {
          name: "pool"
        },
        {
          name: "quote_mint"
        },
        {
          name: "funder",
          writable: true,
          signer: true
        },
        {
          name: "config"
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "InitializeVaultWithConfigParams"
            }
          }
        }
      ]
    },
    {
      name: "initialize_vault_with_prorata_config",
      discriminator: [155, 216, 34, 162, 103, 242, 236, 211],
      accounts: [
        {
          name: "vault",
          writable: true,
          pda: {
            seeds: [
              {
                kind: "const",
                value: [118, 97, 117, 108, 116]
              },
              {
                kind: "account",
                path: "config"
              },
              {
                kind: "account",
                path: "pool"
              }
            ]
          }
        },
        {
          name: "pool"
        },
        {
          name: "quote_mint"
        },
        {
          name: "funder",
          writable: true,
          signer: true
        },
        {
          name: "config"
        },
        {
          name: "system_program",
          address: "11111111111111111111111111111111"
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "InitializeVaultWithConfigParams"
            }
          }
        }
      ]
    },
    {
      name: "transfer_vault_authority",
      discriminator: [139, 35, 83, 88, 52, 186, 162, 110],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "vault_authority",
          signer: true,
          relations: ["vault"]
        }
      ],
      args: [
        {
          name: "new_authority",
          type: "pubkey"
        }
      ]
    },
    {
      name: "update_fcfs_vault_parameters",
      discriminator: [172, 23, 13, 143, 18, 133, 104, 174],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "pool",
          relations: ["vault"]
        },
        {
          name: "admin",
          signer: true
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "UpdateFcfsVaultParams"
            }
          }
        }
      ]
    },
    {
      name: "update_prorata_vault_parameters",
      discriminator: [177, 39, 151, 50, 253, 249, 5, 74],
      accounts: [
        {
          name: "vault",
          writable: true
        },
        {
          name: "pool",
          relations: ["vault"]
        },
        {
          name: "admin",
          signer: true
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "params",
          type: {
            defined: {
              name: "UpdateProrataVaultParams"
            }
          }
        }
      ]
    },
    {
      name: "withdraw",
      discriminator: [183, 18, 70, 156, 148, 109, 161, 34],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: ["escrow"]
        },
        {
          name: "pool",
          relations: ["vault"]
        },
        {
          name: "escrow",
          writable: true
        },
        {
          name: "destination_token",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "token_mint"
        },
        {
          name: "token_program"
        },
        {
          name: "owner",
          signer: true,
          relations: ["escrow"]
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: [
        {
          name: "amount",
          type: "u64"
        }
      ]
    },
    {
      name: "withdraw_remaining_quote",
      discriminator: [54, 253, 188, 34, 100, 145, 59, 127],
      accounts: [
        {
          name: "vault",
          writable: true,
          relations: ["escrow"]
        },
        {
          name: "pool",
          relations: ["vault"]
        },
        {
          name: "escrow",
          writable: true
        },
        {
          name: "token_vault",
          writable: true,
          relations: ["vault"]
        },
        {
          name: "destination_token",
          writable: true
        },
        {
          name: "token_mint"
        },
        {
          name: "token_program"
        },
        {
          name: "owner",
          signer: true,
          relations: ["escrow"]
        },
        {
          name: "event_authority",
          pda: {
            seeds: [
              {
                kind: "const",
                value: [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          name: "program"
        }
      ],
      args: []
    }
  ],
  accounts: [
    {
      name: "CrankFeeWhitelist",
      discriminator: [39, 105, 184, 30, 248, 231, 176, 133]
    },
    {
      name: "Escrow",
      discriminator: [31, 213, 123, 187, 186, 22, 218, 155]
    },
    {
      name: "FcfsVaultConfig",
      discriminator: [99, 243, 252, 122, 160, 175, 130, 52]
    },
    {
      name: "MerkleProofMetadata",
      discriminator: [133, 24, 30, 217, 240, 20, 222, 100]
    },
    {
      name: "MerkleRootConfig",
      discriminator: [103, 2, 222, 217, 73, 50, 187, 39]
    },
    {
      name: "ProrataVaultConfig",
      discriminator: [93, 214, 205, 104, 119, 9, 51, 152]
    },
    {
      name: "Vault",
      discriminator: [211, 8, 232, 43, 2, 152, 117, 119]
    }
  ],
  events: [
    {
      name: "CrankFeeWhitelistClosed",
      discriminator: [157, 171, 85, 155, 37, 20, 41, 114]
    },
    {
      name: "CrankFeeWhitelistCreated",
      discriminator: [176, 138, 32, 77, 129, 74, 137, 244]
    },
    {
      name: "EscrowClaimToken",
      discriminator: [179, 72, 71, 30, 59, 19, 170, 3]
    },
    {
      name: "EscrowClosed",
      discriminator: [109, 20, 57, 51, 217, 118, 3, 173]
    },
    {
      name: "EscrowCreated",
      discriminator: [70, 127, 105, 102, 92, 97, 7, 173]
    },
    {
      name: "EscrowDeposit",
      discriminator: [43, 90, 49, 176, 134, 148, 50, 32]
    },
    {
      name: "EscrowRemainingWithdraw",
      discriminator: [113, 14, 156, 89, 113, 79, 88, 178]
    },
    {
      name: "EscrowWithdraw",
      discriminator: [171, 17, 164, 116, 122, 66, 183, 34]
    },
    {
      name: "FcfsVaultCreated",
      discriminator: [73, 153, 165, 103, 151, 182, 184, 136]
    },
    {
      name: "FcfsVaultParametersUpdated",
      discriminator: [78, 112, 112, 62, 193, 209, 231, 226]
    },
    {
      name: "MerkleProofMetadataCreated",
      discriminator: [186, 42, 131, 176, 244, 128, 196, 68]
    },
    {
      name: "MerkleRootConfigCreated",
      discriminator: [121, 112, 42, 76, 144, 131, 142, 90]
    },
    {
      name: "ProrataVaultCreated",
      discriminator: [181, 255, 162, 226, 203, 199, 193, 6]
    },
    {
      name: "ProrataVaultParametersUpdated",
      discriminator: [24, 147, 160, 237, 132, 87, 15, 206]
    },
    {
      name: "SwapFill",
      discriminator: [116, 212, 73, 222, 33, 244, 134, 148]
    }
  ],
  errors: [
    {
      code: 6e3,
      name: "TimePointNotInFuture",
      msg: "Time point is not in future"
    },
    {
      code: 6001,
      name: "IncorrectTokenMint",
      msg: "Token mint is incorrect"
    },
    {
      code: 6002,
      name: "IncorrectPairType",
      msg: "Pair is not permissioned"
    },
    {
      code: 6003,
      name: "PoolHasStarted",
      msg: "Pool has started"
    },
    {
      code: 6004,
      name: "NotPermitThisActionInThisTimePoint",
      msg: "This action is not permitted in this time point"
    },
    {
      code: 6005,
      name: "TheSaleIsOngoing",
      msg: "The sale is on going, cannot withdraw"
    },
    {
      code: 6006,
      name: "EscrowIsNotClosable",
      msg: "Escrow is not closable"
    },
    {
      code: 6007,
      name: "TimePointOrdersAreIncorrect",
      msg: "Time point orders are incorrect"
    },
    {
      code: 6008,
      name: "EscrowHasRefunded",
      msg: "Escrow has refunded"
    },
    {
      code: 6009,
      name: "MathOverflow",
      msg: "Math operation overflow"
    },
    {
      code: 6010,
      name: "MaxBuyingCapIsZero",
      msg: "Max buying cap is zero"
    },
    {
      code: 6011,
      name: "MaxAmountIsTooSmall",
      msg: "Max amount is too small"
    },
    {
      code: 6012,
      name: "PoolTypeIsNotSupported",
      msg: "Pool type is not supported"
    },
    {
      code: 6013,
      name: "InvalidAdmin",
      msg: "Invalid admin"
    },
    {
      code: 6014,
      name: "VaultModeIsIncorrect",
      msg: "Vault mode is incorrect"
    },
    {
      code: 6015,
      name: "MaxDepositingCapIsInValid",
      msg: "Max depositing cap is invalid"
    },
    {
      code: 6016,
      name: "VestingDurationIsInValid",
      msg: "Vesting duration is invalid"
    },
    {
      code: 6017,
      name: "DepositAmountIsZero",
      msg: "Deposit amount is zero"
    },
    {
      code: 6018,
      name: "PoolOwnerIsMismatched",
      msg: "Pool owner is mismatched"
    },
    {
      code: 6019,
      name: "WithdrawAmountIsZero",
      msg: "Withdraw amount is zero"
    },
    {
      code: 6020,
      name: "DepositingDurationIsInvalid",
      msg: "Depositing duration is invalid"
    },
    {
      code: 6021,
      name: "DepositingTimePointIsInvalid",
      msg: "Depositing time point is invalid"
    },
    {
      code: 6022,
      name: "IndividualDepositingCapIsZero",
      msg: "Individual depositing cap is zero"
    },
    {
      code: 6023,
      name: "InvalidFeeReceiverAccount",
      msg: "Invalid fee receiver account"
    },
    {
      code: 6024,
      name: "NotPermissionedVault",
      msg: "Not permissioned vault"
    },
    {
      code: 6025,
      name: "NotPermitToDoThisAction",
      msg: "Not permit to do this action"
    },
    {
      code: 6026,
      name: "InvalidProof",
      msg: "Invalid Merkle proof"
    },
    {
      code: 6027,
      name: "InvalidActivationType",
      msg: "Invalid activation type"
    },
    {
      code: 6028,
      name: "ActivationTypeIsMismatched",
      msg: "Activation type is mismatched"
    },
    {
      code: 6029,
      name: "InvalidPool",
      msg: "Pool is not connected to the alpha vault"
    },
    {
      code: 6030,
      name: "InvalidCreator",
      msg: "Invalid creator"
    },
    {
      code: 6031,
      name: "PermissionedVaultCannotChargeEscrowFee",
      msg: "Permissioned vault cannot charge escrow fee"
    },
    {
      code: 6032,
      name: "EscrowFeeTooHigh",
      msg: "Escrow fee too high"
    },
    {
      code: 6033,
      name: "LockDurationInvalid",
      msg: "Lock duration is invalid"
    },
    {
      code: 6034,
      name: "MaxBuyingCapIsTooSmall",
      msg: "Max buying cap is too small"
    },
    {
      code: 6035,
      name: "MaxDepositingCapIsTooSmall",
      msg: "Max depositing cap is too small"
    },
    {
      code: 6036,
      name: "InvalidWhitelistWalletMode",
      msg: "Invalid whitelist wallet mode"
    },
    {
      code: 6037,
      name: "InvalidCrankFeeWhitelist",
      msg: "Invalid crank fee whitelist"
    },
    {
      code: 6038,
      name: "MissingFeeReceiver",
      msg: "Missing fee receiver"
    },
    {
      code: 6039,
      name: "DiscriminatorIsMismatched",
      msg: "Discriminator is mismatched"
    }
  ],
  types: [
    {
      name: "AccountsType",
      type: {
        kind: "enum",
        variants: [
          {
            name: "TransferHookX"
          },
          {
            name: "TransferHookY"
          },
          {
            name: "TransferHookReward"
          }
        ]
      }
    },
    {
      name: "CrankFeeWhitelist",
      serialization: "bytemuck",
      repr: {
        kind: "c"
      },
      type: {
        kind: "struct",
        fields: [
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "padding",
            type: {
              array: ["u128", 5]
            }
          }
        ]
      }
    },
    {
      name: "CrankFeeWhitelistClosed",
      type: {
        kind: "struct",
        fields: [
          {
            name: "cranker",
            type: "pubkey"
          }
        ]
      }
    },
    {
      name: "CrankFeeWhitelistCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "cranker",
            type: "pubkey"
          }
        ]
      }
    },
    {
      name: "CreateMerkleRootConfigParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "root",
            docs: ["The 256-bit merkle root."],
            type: {
              array: ["u8", 32]
            }
          },
          {
            name: "version",
            docs: ["version"],
            type: "u64"
          }
        ]
      }
    },
    {
      name: "Escrow",
      serialization: "bytemuck",
      repr: {
        kind: "c"
      },
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            docs: ["vault address"],
            type: "pubkey"
          },
          {
            name: "owner",
            docs: ["owner"],
            type: "pubkey"
          },
          {
            name: "total_deposit",
            docs: ["total deposited quote token"],
            type: "u64"
          },
          {
            name: "claimed_token",
            docs: ["Total token that escrow has claimed"],
            type: "u64"
          },
          {
            name: "last_claimed_point",
            docs: ["Last claimed timestamp"],
            type: "u64"
          },
          {
            name: "refunded",
            docs: ["Whether owner has claimed for remaining quote token"],
            type: "u8"
          },
          {
            name: "padding_1",
            docs: ["padding 1"],
            type: {
              array: ["u8", 7]
            }
          },
          {
            name: "max_cap",
            docs: ["Only has meaning in permissioned vault"],
            type: "u64"
          },
          {
            name: "withdrawn_deposit_overflow",
            docs: ["Only has meaning in pro-rata vault"],
            type: "u64"
          },
          {
            name: "padding",
            type: {
              array: ["u128", 1]
            }
          }
        ]
      }
    },
    {
      name: "EscrowClaimToken",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "amount",
            type: "u64"
          },
          {
            name: "vault_total_claimed_token",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "EscrowClosed",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "vault_total_escrow",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "EscrowCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "vault_total_escrow",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "EscrowDeposit",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "amount",
            type: "u64"
          },
          {
            name: "vault_total_deposit",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "EscrowRemainingWithdraw",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "amount",
            type: "u64"
          },
          {
            name: "vault_remaining_deposit",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "EscrowWithdraw",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "escrow",
            type: "pubkey"
          },
          {
            name: "owner",
            type: "pubkey"
          },
          {
            name: "amount",
            type: "u64"
          },
          {
            name: "vault_total_deposit",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "FcfsConfigParameters",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "start_vesting_duration",
            type: "u64"
          },
          {
            name: "end_vesting_duration",
            type: "u64"
          },
          {
            name: "depositing_duration_until_last_join_point",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          },
          {
            name: "index",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "FcfsVaultConfig",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "start_vesting_duration",
            type: "u64"
          },
          {
            name: "end_vesting_duration",
            type: "u64"
          },
          {
            name: "depositing_duration_until_last_join_point",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          },
          {
            name: "_padding",
            type: {
              array: ["u8", 175]
            }
          }
        ]
      }
    },
    {
      name: "FcfsVaultCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "base_mint",
            type: "pubkey"
          },
          {
            name: "quote_mint",
            type: "pubkey"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          },
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "pool",
            type: "pubkey"
          },
          {
            name: "pool_type",
            type: "u8"
          },
          {
            name: "depositing_point",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "FcfsVaultParametersUpdated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          },
          {
            name: "depositing_point",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "InitializeFcfsVaultParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "pool_type",
            type: "u8"
          },
          {
            name: "quote_mint",
            type: "pubkey"
          },
          {
            name: "base_mint",
            type: "pubkey"
          },
          {
            name: "depositing_point",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          },
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "whitelist_mode",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "InitializeProrataVaultParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "pool_type",
            type: "u8"
          },
          {
            name: "quote_mint",
            type: "pubkey"
          },
          {
            name: "base_mint",
            type: "pubkey"
          },
          {
            name: "depositing_point",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          },
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "whitelist_mode",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "InitializeVaultWithConfigParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "pool_type",
            type: "u8"
          },
          {
            name: "quote_mint",
            type: "pubkey"
          },
          {
            name: "base_mint",
            type: "pubkey"
          },
          {
            name: "whitelist_mode",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "MerkleProofMetadata",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            docs: ["vault pubkey that config is belong"],
            type: "pubkey"
          },
          {
            name: "padding",
            type: {
              array: ["u64", 16]
            }
          },
          {
            name: "proof_url",
            docs: ["proof url"],
            type: "string"
          }
        ]
      }
    },
    {
      name: "MerkleProofMetadataCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "proof_url",
            type: "string"
          }
        ]
      }
    },
    {
      name: "MerkleRootConfig",
      serialization: "bytemuck",
      repr: {
        kind: "c"
      },
      type: {
        kind: "struct",
        fields: [
          {
            name: "root",
            docs: ["The 256-bit merkle root."],
            type: {
              array: ["u8", 32]
            }
          },
          {
            name: "vault",
            docs: ["vault pubkey that config is belong"],
            type: "pubkey"
          },
          {
            name: "version",
            docs: ["version"],
            type: "u64"
          },
          {
            name: "_padding",
            docs: ["padding for further use"],
            type: {
              array: ["u64", 8]
            }
          }
        ]
      }
    },
    {
      name: "MerkleRootConfigCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "admin",
            type: "pubkey"
          },
          {
            name: "config",
            type: "pubkey"
          },
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "version",
            type: "u64"
          },
          {
            name: "root",
            type: {
              array: ["u8", 32]
            }
          }
        ]
      }
    },
    {
      name: "ProrataConfigParameters",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "start_vesting_duration",
            type: "u64"
          },
          {
            name: "end_vesting_duration",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          },
          {
            name: "index",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "ProrataVaultConfig",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "start_vesting_duration",
            type: "u64"
          },
          {
            name: "end_vesting_duration",
            type: "u64"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          },
          {
            name: "_padding",
            type: {
              array: ["u8", 191]
            }
          }
        ]
      }
    },
    {
      name: "ProrataVaultCreated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "base_mint",
            type: "pubkey"
          },
          {
            name: "quote_mint",
            type: "pubkey"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          },
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "pool",
            type: "pubkey"
          },
          {
            name: "pool_type",
            type: "u8"
          },
          {
            name: "escrow_fee",
            type: "u64"
          },
          {
            name: "activation_type",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "ProrataVaultParametersUpdated",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "RemainingAccountsInfo",
      type: {
        kind: "struct",
        fields: [
          {
            name: "slices",
            type: {
              vec: {
                defined: {
                  name: "RemainingAccountsSlice"
                }
              }
            }
          }
        ]
      }
    },
    {
      name: "RemainingAccountsSlice",
      type: {
        kind: "struct",
        fields: [
          {
            name: "accounts_type",
            type: {
              defined: {
                name: "AccountsType"
              }
            }
          },
          {
            name: "length",
            type: "u8"
          }
        ]
      }
    },
    {
      name: "SwapFill",
      type: {
        kind: "struct",
        fields: [
          {
            name: "vault",
            type: "pubkey"
          },
          {
            name: "pair",
            type: "pubkey"
          },
          {
            name: "fill_amount",
            type: "u64"
          },
          {
            name: "purchased_amount",
            type: "u64"
          },
          {
            name: "unfilled_amount",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "UpdateFcfsVaultParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_depositing_cap",
            type: "u64"
          },
          {
            name: "depositing_point",
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "UpdateProrataVaultParams",
      type: {
        kind: "struct",
        fields: [
          {
            name: "max_buying_cap",
            type: "u64"
          },
          {
            name: "start_vesting_point",
            type: "u64"
          },
          {
            name: "end_vesting_point",
            type: "u64"
          }
        ]
      }
    },
    {
      name: "Vault",
      serialization: "bytemuck",
      repr: {
        kind: "c"
      },
      type: {
        kind: "struct",
        fields: [
          {
            name: "pool",
            docs: ["pool"],
            type: "pubkey"
          },
          {
            name: "token_vault",
            docs: ["reserve quote token"],
            type: "pubkey"
          },
          {
            name: "token_out_vault",
            docs: ["reserve base token"],
            type: "pubkey"
          },
          {
            name: "quote_mint",
            docs: ["quote token"],
            type: "pubkey"
          },
          {
            name: "base_mint",
            docs: ["base token"],
            type: "pubkey"
          },
          {
            name: "base",
            docs: ["base key"],
            type: "pubkey"
          },
          {
            name: "owner",
            docs: ["owner key, deprecated field, can re-use in the future"],
            type: "pubkey"
          },
          {
            name: "max_buying_cap",
            docs: ["max buying cap"],
            type: "u64"
          },
          {
            name: "total_deposit",
            docs: ["total deposited quote token"],
            type: "u64"
          },
          {
            name: "total_escrow",
            docs: ["total user deposit"],
            type: "u64"
          },
          {
            name: "swapped_amount",
            docs: ["swapped_amount"],
            type: "u64"
          },
          {
            name: "bought_token",
            docs: ["total bought token"],
            type: "u64"
          },
          {
            name: "total_refund",
            docs: ["Total quote refund"],
            type: "u64"
          },
          {
            name: "total_claimed_token",
            docs: ["Total claimed_token"],
            type: "u64"
          },
          {
            name: "start_vesting_point",
            docs: ["Start vesting ts"],
            type: "u64"
          },
          {
            name: "end_vesting_point",
            docs: ["End vesting ts"],
            type: "u64"
          },
          {
            name: "bump",
            docs: ["bump"],
            type: "u8"
          },
          {
            name: "pool_type",
            docs: ["pool type"],
            type: "u8"
          },
          {
            name: "vault_mode",
            docs: ["vault mode"],
            type: "u8"
          },
          {
            name: "padding_0",
            docs: ["padding 0"],
            type: {
              array: ["u8", 5]
            }
          },
          {
            name: "max_depositing_cap",
            docs: ["max depositing cap"],
            type: "u64"
          },
          {
            name: "individual_depositing_cap",
            docs: ["individual depositing cap"],
            type: "u64"
          },
          {
            name: "depositing_point",
            docs: ["depositing point"],
            type: "u64"
          },
          {
            name: "escrow_fee",
            docs: ["flat fee when user open an escrow"],
            type: "u64"
          },
          {
            name: "total_escrow_fee",
            docs: ["total escrow fee just for statistic"],
            type: "u64"
          },
          {
            name: "whitelist_mode",
            docs: ["deposit whitelist mode"],
            type: "u8"
          },
          {
            name: "activation_type",
            docs: ["activation type"],
            type: "u8"
          },
          {
            name: "padding_1",
            docs: ["padding 1"],
            type: {
              array: ["u8", 6]
            }
          },
          {
            name: "vault_authority",
            docs: [
              "vault authority normally is vault creator, will be able to create merkle root config"
            ],
            type: "pubkey"
          },
          {
            name: "padding",
            type: {
              array: ["u128", 5]
            }
          }
        ]
      }
    }
  ]
};

// src/index.ts
var src_default = AlphaVault;


































exports.ALPHA_VAULT_TREASURY_ID = ALPHA_VAULT_TREASURY_ID; exports.ActivationType = ActivationType; exports.BalanceTree = BalanceTree; exports.ClockLayout = ClockLayout; exports.DLMM_PROGRAM_ID = DLMM_PROGRAM_ID; exports.DYNAMIC_AMM_PROGRAM_ID = DYNAMIC_AMM_PROGRAM_ID; exports.IDL = alpha_vault_default2; exports.MERKLE_PROOF_API = MERKLE_PROOF_API; exports.MerkleTree = MerkleTree; exports.PROGRAM_ID = PROGRAM_ID; exports.PoolType = PoolType; exports.SEED = SEED; exports.VAULT_PROGRAM_ID = VAULT_PROGRAM_ID; exports.VaultMode = VaultMode; exports.VaultState = VaultState; exports.WhitelistMode = WhitelistMode; exports.createCpAmmProgram = createCpAmmProgram; exports.createDammProgram = createDammProgram; exports.createDlmmProgram = createDlmmProgram; exports.createProgram = createProgram; exports.default = src_default; exports.deriveAlphaVault = deriveAlphaVault; exports.deriveCrankFeeWhitelist = deriveCrankFeeWhitelist; exports.deriveEscrow = deriveEscrow; exports.deriveMerkleProofMetadata = deriveMerkleProofMetadata; exports.deriveMerkleRootConfig = deriveMerkleRootConfig; exports.estimateSlotDate = estimateSlotDate; exports.fillDammTransaction = fillDammTransaction; exports.fillDammV2Transaction = fillDammV2Transaction; exports.fillDlmmTransaction = fillDlmmTransaction; exports.getOrCreateATAInstruction = getOrCreateATAInstruction; exports.unwrapSOLInstruction = unwrapSOLInstruction; exports.wrapSOLInstruction = wrapSOLInstruction;
//# sourceMappingURL=index.js.map