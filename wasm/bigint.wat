(module
  (memory (export "memory") 512)
  
  (global $MAX_LIMBS i32 (i32.const 256))
  
  ;; ===== 多倍長加算 (最適化版) =====
  (func $add (param $a_ptr i32) (param $b_ptr i32) (param $result_ptr i32) (param $limbs i32) (result i32)
    (local $i i32)
    (local $carry i64)
    (local $a_val i64)
    (local $b_val i64)
    (local $sum i64)
    (local $a_offset i32)
    (local $b_offset i32)
    (local $r_offset i32)
    
    (local.set $carry (i64.const 0))
    
    ;; ループ展開: 4要素ずつ処理
    (local.set $i (local.get $limbs))
    (block $unroll_break
      (loop $unroll_loop
        (br_if $unroll_break (i32.lt_u (local.get $i) (i32.const 4)))
        
        (local.set $a_offset (local.get $a_ptr))
        (local.set $b_offset (local.get $b_ptr))
        (local.set $r_offset (local.get $result_ptr))
        
        ;; 要素0
        (local.set $a_val (i64.load (local.get $a_offset)))
        (local.set $b_val (i64.load (local.get $b_offset)))
        (local.set $sum (i64.add (i64.add (local.get $a_val) (local.get $b_val)) (local.get $carry)))
        (i64.store (local.get $r_offset) (local.get $sum))
        (local.set $carry 
          (i64.extend_i32_u
            (i32.or
              (i64.lt_u (i64.add (local.get $a_val) (local.get $carry)) (local.get $a_val))
              (i64.lt_u (local.get $sum) (local.get $b_val))
            )
          )
        )
        
        ;; 要素1
        (local.set $a_offset (i32.add (local.get $a_offset) (i32.const 8)))
        (local.set $b_offset (i32.add (local.get $b_offset) (i32.const 8)))
        (local.set $r_offset (i32.add (local.get $r_offset) (i32.const 8)))
        (local.set $a_val (i64.load (local.get $a_offset)))
        (local.set $b_val (i64.load (local.get $b_offset)))
        (local.set $sum (i64.add (i64.add (local.get $a_val) (local.get $b_val)) (local.get $carry)))
        (i64.store (local.get $r_offset) (local.get $sum))
        (local.set $carry 
          (i64.extend_i32_u
            (i32.or
              (i64.lt_u (i64.add (local.get $a_val) (local.get $carry)) (local.get $a_val))
              (i64.lt_u (local.get $sum) (local.get $b_val))
            )
          )
        )
        
        ;; 要素2
        (local.set $a_offset (i32.add (local.get $a_offset) (i32.const 8)))
        (local.set $b_offset (i32.add (local.get $b_offset) (i32.const 8)))
        (local.set $r_offset (i32.add (local.get $r_offset) (i32.const 8)))
        (local.set $a_val (i64.load (local.get $a_offset)))
        (local.set $b_val (i64.load (local.get $b_offset)))
        (local.set $sum (i64.add (i64.add (local.get $a_val) (local.get $b_val)) (local.get $carry)))
        (i64.store (local.get $r_offset) (local.get $sum))
        (local.set $carry 
          (i64.extend_i32_u
            (i32.or
              (i64.lt_u (i64.add (local.get $a_val) (local.get $carry)) (local.get $a_val))
              (i64.lt_u (local.get $sum) (local.get $b_val))
            )
          )
        )
        
        ;; 要素3
        (local.set $a_offset (i32.add (local.get $a_offset) (i32.const 8)))
        (local.set $b_offset (i32.add (local.get $b_offset) (i32.const 8)))
        (local.set $r_offset (i32.add (local.get $r_offset) (i32.const 8)))
        (local.set $a_val (i64.load (local.get $a_offset)))
        (local.set $b_val (i64.load (local.get $b_offset)))
        (local.set $sum (i64.add (i64.add (local.get $a_val) (local.get $b_val)) (local.get $carry)))
        (i64.store (local.get $r_offset) (local.get $sum))
        (local.set $carry 
          (i64.extend_i32_u
            (i32.or
              (i64.lt_u (i64.add (local.get $a_val) (local.get $carry)) (local.get $a_val))
              (i64.lt_u (local.get $sum) (local.get $b_val))
            )
          )
        )
        
        (local.set $a_ptr (i32.add (local.get $a_ptr) (i32.const 32)))
        (local.set $b_ptr (i32.add (local.get $b_ptr) (i32.const 32)))
        (local.set $result_ptr (i32.add (local.get $result_ptr) (i32.const 32)))
        (local.set $i (i32.sub (local.get $i) (i32.const 4)))
        (br $unroll_loop)
      )
    )
    
    ;; 残り要素の処理
    (block $break
      (loop $loop
        (br_if $break (i32.eqz (local.get $i)))
        
        (local.set $a_val (i64.load (local.get $a_ptr)))
        (local.set $b_val (i64.load (local.get $b_ptr)))
        (local.set $sum (i64.add (i64.add (local.get $a_val) (local.get $b_val)) (local.get $carry)))
        (i64.store (local.get $result_ptr) (local.get $sum))
        
        (local.set $carry 
          (i64.extend_i32_u
            (i32.or
              (i64.lt_u (i64.add (local.get $a_val) (local.get $carry)) (local.get $a_val))
              (i64.lt_u (local.get $sum) (local.get $b_val))
            )
          )
        )
        
        (local.set $a_ptr (i32.add (local.get $a_ptr) (i32.const 8)))
        (local.set $b_ptr (i32.add (local.get $b_ptr) (i32.const 8)))
        (local.set $result_ptr (i32.add (local.get $result_ptr) (i32.const 8)))
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
    
    (i32.wrap_i64 (local.get $carry))
  )
  
  ;; ===== 多倍長減算 (最適化版) =====
  (func $sub (param $a_ptr i32) (param $b_ptr i32) (param $result_ptr i32) (param $limbs i32) (result i32)
    (local $i i32)
    (local $borrow i64)
    (local $a_val i64)
    (local $b_val i64)
    (local $diff i64)
    
    (local.set $borrow (i64.const 0))
    
    ;; ループ展開: 4要素ずつ
    (local.set $i (local.get $limbs))
    (block $unroll_break
      (loop $unroll_loop
        (br_if $unroll_break (i32.lt_u (local.get $i) (i32.const 4)))
        
        ;; 要素0-3を連続処理
        (local.set $a_val (i64.load (local.get $a_ptr)))
        (local.set $b_val (i64.load (local.get $b_ptr)))
        (local.set $diff (i64.sub (i64.sub (local.get $a_val) (local.get $b_val)) (local.get $borrow)))
        (i64.store (local.get $result_ptr) (local.get $diff))
        (local.set $borrow 
          (i64.extend_i32_u
            (i32.or
              (i64.gt_u (local.get $b_val) (local.get $a_val))
              (i64.gt_u (i64.add (local.get $b_val) (local.get $borrow)) (local.get $a_val))
            )
          )
        )
        
        (local.set $a_val (i64.load (i32.add (local.get $a_ptr) (i32.const 8))))
        (local.set $b_val (i64.load (i32.add (local.get $b_ptr) (i32.const 8))))
        (local.set $diff (i64.sub (i64.sub (local.get $a_val) (local.get $b_val)) (local.get $borrow)))
        (i64.store (i32.add (local.get $result_ptr) (i32.const 8)) (local.get $diff))
        (local.set $borrow 
          (i64.extend_i32_u
            (i32.or
              (i64.gt_u (local.get $b_val) (local.get $a_val))
              (i64.gt_u (i64.add (local.get $b_val) (local.get $borrow)) (local.get $a_val))
            )
          )
        )
        
        (local.set $a_val (i64.load (i32.add (local.get $a_ptr) (i32.const 16))))
        (local.set $b_val (i64.load (i32.add (local.get $b_ptr) (i32.const 16))))
        (local.set $diff (i64.sub (i64.sub (local.get $a_val) (local.get $b_val)) (local.get $borrow)))
        (i64.store (i32.add (local.get $result_ptr) (i32.const 16)) (local.get $diff))
        (local.set $borrow 
          (i64.extend_i32_u
            (i32.or
              (i64.gt_u (local.get $b_val) (local.get $a_val))
              (i64.gt_u (i64.add (local.get $b_val) (local.get $borrow)) (local.get $a_val))
            )
          )
        )
        
        (local.set $a_val (i64.load (i32.add (local.get $a_ptr) (i32.const 24))))
        (local.set $b_val (i64.load (i32.add (local.get $b_ptr) (i32.const 24))))
        (local.set $diff (i64.sub (i64.sub (local.get $a_val) (local.get $b_val)) (local.get $borrow)))
        (i64.store (i32.add (local.get $result_ptr) (i32.const 24)) (local.get $diff))
        (local.set $borrow 
          (i64.extend_i32_u
            (i32.or
              (i64.gt_u (local.get $b_val) (local.get $a_val))
              (i64.gt_u (i64.add (local.get $b_val) (local.get $borrow)) (local.get $a_val))
            )
          )
        )
        
        (local.set $a_ptr (i32.add (local.get $a_ptr) (i32.const 32)))
        (local.set $b_ptr (i32.add (local.get $b_ptr) (i32.const 32)))
        (local.set $result_ptr (i32.add (local.get $result_ptr) (i32.const 32)))
        (local.set $i (i32.sub (local.get $i) (i32.const 4)))
        (br $unroll_loop)
      )
    )
    
    ;; 残り
    (block $break
      (loop $loop
        (br_if $break (i32.eqz (local.get $i)))
        
        (local.set $a_val (i64.load (local.get $a_ptr)))
        (local.set $b_val (i64.load (local.get $b_ptr)))
        (local.set $diff (i64.sub (i64.sub (local.get $a_val) (local.get $b_val)) (local.get $borrow)))
        (i64.store (local.get $result_ptr) (local.get $diff))
        
        (local.set $borrow 
          (i64.extend_i32_u
            (i32.or
              (i64.gt_u (local.get $b_val) (local.get $a_val))
              (i64.gt_u (i64.add (local.get $b_val) (local.get $borrow)) (local.get $a_val))
            )
          )
        )
        
        (local.set $a_ptr (i32.add (local.get $a_ptr) (i32.const 8)))
        (local.set $b_ptr (i32.add (local.get $b_ptr) (i32.const 8)))
        (local.set $result_ptr (i32.add (local.get $result_ptr) (i32.const 8)))
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
    
    (i32.wrap_i64 (local.get $borrow))
  )
  
  ;; ===== 64×64→128 乗算 (インライン最適化) =====
  (func $mul64x64 (param $a i64) (param $b i64) (param $result_ptr i32)
    (local $a_lo i64)
    (local $a_hi i64)
    (local $b_lo i64)
    (local $b_hi i64)
    (local $p0 i64)
    (local $p1 i64)
    (local $p2 i64)
    (local $p3 i64)
    (local $carry i64)
    (local $lo i64)
    (local $hi i64)
    
    (local.set $a_lo (i64.and (local.get $a) (i64.const 0xFFFFFFFF)))
    (local.set $a_hi (i64.shr_u (local.get $a) (i64.const 32)))
    (local.set $b_lo (i64.and (local.get $b) (i64.const 0xFFFFFFFF)))
    (local.set $b_hi (i64.shr_u (local.get $b) (i64.const 32)))
    
    (local.set $p0 (i64.mul (local.get $a_lo) (local.get $b_lo)))
    (local.set $p1 (i64.mul (local.get $a_hi) (local.get $b_lo)))
    (local.set $p2 (i64.mul (local.get $a_lo) (local.get $b_hi)))
    (local.set $p3 (i64.mul (local.get $a_hi) (local.get $b_hi)))
    
    (local.set $carry (i64.shr_u (local.get $p0) (i64.const 32)))
    (local.set $lo (i64.and (local.get $p0) (i64.const 0xFFFFFFFF)))
    
    (local.set $carry (i64.add (local.get $carry) (i64.and (local.get $p1) (i64.const 0xFFFFFFFF))))
    (local.set $carry (i64.add (local.get $carry) (i64.and (local.get $p2) (i64.const 0xFFFFFFFF))))
    (local.set $lo (i64.or (local.get $lo) (i64.shl (local.get $carry) (i64.const 32))))
    
    (local.set $hi (i64.add (local.get $p3) (i64.shr_u (local.get $p1) (i64.const 32))))
    (local.set $hi (i64.add (local.get $hi) (i64.shr_u (local.get $p2) (i64.const 32))))
    (local.set $hi (i64.add (local.get $hi) (i64.shr_u (local.get $carry) (i64.const 32))))
    
    (i64.store (local.get $result_ptr) (local.get $lo))
    (i64.store (i32.add (local.get $result_ptr) (i32.const 8)) (local.get $hi))
  )
  
  ;; ===== 多倍長乗算 (最適化版) =====
  (func $mul (param $a_ptr i32) (param $b_ptr i32) (param $result_ptr i32) (param $a_limbs i32) (param $b_limbs i32)
    (local $i i32)
    (local $j i32)
    (local $a_val i64)
    (local $b_val i64)
    (local $result_idx i32)
    (local $prod_lo i64)
    (local $prod_hi i64)
    (local $sum i64)
    (local $old_sum i64)
    (local $carry i64)
    (local $temp_ptr i32)
    (local $total_limbs i32)
    (local $r_ptr i32)
    
    (local.set $temp_ptr (i32.const 8192))
    (local.set $total_limbs (i32.add (local.get $a_limbs) (local.get $b_limbs)))
    
    ;; ゼロ初期化 (8バイトずつ)
    (local.set $i (local.get $total_limbs))
    (local.set $r_ptr (local.get $result_ptr))
    (block $init_break
      (loop $init_loop
        (br_if $init_break (i32.eqz (local.get $i)))
        (i64.store (local.get $r_ptr) (i64.const 0))
        (local.set $r_ptr (i32.add (local.get $r_ptr) (i32.const 8)))
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (br $init_loop)
      )
    )
    
    (local.set $i (i32.const 0))
    (block $outer_break
      (loop $outer_loop
        (br_if $outer_break (i32.ge_u (local.get $i) (local.get $a_limbs)))
        
        (local.set $a_val (i64.load (i32.add (local.get $a_ptr) (i32.mul (local.get $i) (i32.const 8)))))
        
        ;; a_val が 0 ならスキップ
        (if (i64.eqz (local.get $a_val))
          (then
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $outer_loop)
          )
        )
        
        (local.set $j (i32.const 0))
        (local.set $carry (i64.const 0))
        
        (block $inner_break
          (loop $inner_loop
            (br_if $inner_break (i32.ge_u (local.get $j) (local.get $b_limbs)))
            
            (local.set $b_val (i64.load (i32.add (local.get $b_ptr) (i32.mul (local.get $j) (i32.const 8)))))
            
            (call $mul64x64 (local.get $a_val) (local.get $b_val) (local.get $temp_ptr))
            (local.set $prod_lo (i64.load (local.get $temp_ptr)))
            (local.set $prod_hi (i64.load (i32.add (local.get $temp_ptr) (i32.const 8))))
            
            (local.set $result_idx (i32.add (local.get $i) (local.get $j)))
            (local.set $sum (i64.load (i32.add (local.get $result_ptr) (i32.mul (local.get $result_idx) (i32.const 8)))))
            
            (local.set $old_sum (local.get $sum))
            (local.set $sum (i64.add (local.get $sum) (local.get $prod_lo)))
            (local.set $prod_hi (i64.add (local.get $prod_hi) (i64.extend_i32_u (i64.lt_u (local.get $sum) (local.get $old_sum)))))
            
            (local.set $old_sum (local.get $sum))
            (local.set $sum (i64.add (local.get $sum) (local.get $carry)))
            (local.set $prod_hi (i64.add (local.get $prod_hi) (i64.extend_i32_u (i64.lt_u (local.get $sum) (local.get $old_sum)))))
            
            (i64.store (i32.add (local.get $result_ptr) (i32.mul (local.get $result_idx) (i32.const 8))) (local.get $sum))
            (local.set $carry (local.get $prod_hi))
            
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $inner_loop)
          )
        )
        
        (if (i64.ne (local.get $carry) (i64.const 0))
          (then
            (local.set $result_idx (i32.add (local.get $i) (local.get $b_limbs)))
            (i64.store (i32.add (local.get $result_ptr) (i32.mul (local.get $result_idx) (i32.const 8))) (local.get $carry))
          )
        )
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $outer_loop)
      )
    )
  )
  
  ;; ===== 比較関数 (最適化版) =====
  (func $cmp (param $a_ptr i32) (param $b_ptr i32) (param $limbs i32) (result i32)
    (local $i i32)
    (local $a_val i64)
    (local $b_val i64)
    (local $a_offset i32)
    (local $b_offset i32)
    
    (local.set $i (local.get $limbs))
    (local.set $a_offset (i32.mul (i32.sub (local.get $i) (i32.const 1)) (i32.const 8)))
    (local.set $b_offset (local.get $a_offset))
    
    (block $break
      (loop $loop
        (br_if $break (i32.eqz (local.get $i)))
        
        (local.set $a_val (i64.load (i32.add (local.get $a_ptr) (local.get $a_offset))))
        (local.set $b_val (i64.load (i32.add (local.get $b_ptr) (local.get $b_offset))))
        
        (if (i64.gt_u (local.get $a_val) (local.get $b_val)) (then (return (i32.const 1))))
        (if (i64.lt_u (local.get $a_val) (local.get $b_val)) (then (return (i32.const -1))))
        
        (local.set $a_offset (i32.sub (local.get $a_offset) (i32.const 8)))
        (local.set $b_offset (i32.sub (local.get $b_offset) (i32.const 8)))
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
    
    (i32.const 0)
  )
  
  ;; ===== 左シフト（1bit） =====
  (func $shl1 (param $a_ptr i32) (param $result_ptr i32) (param $limbs i32)
    (local $i i32)
    (local $val i64)
    (local $carry i64)
    
    (local.set $i (i32.const 0))
    (local.set $carry (i64.const 0))
    
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $limbs)))
        
        (local.set $val (i64.load (i32.add (local.get $a_ptr) (i32.mul (local.get $i) (i32.const 8)))))
        (i64.store 
          (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (i64.or (i64.shl (local.get $val) (i64.const 1)) (local.get $carry))
        )
        (local.set $carry (i64.shr_u (local.get $val) (i64.const 63)))
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
  )
  
  ;; ===== 右シフト（1bit） =====
  (func $shr1 (param $a_ptr i32) (param $result_ptr i32) (param $limbs i32)
    (local $i i32)
    (local $val i64)
    (local $borrow i64)
    
    (local.set $i (i32.sub (local.get $limbs) (i32.const 1)))
    (local.set $borrow (i64.const 0))
    
    (block $break
      (loop $loop
        (br_if $break (i32.lt_s (local.get $i) (i32.const 0)))
        
        (local.set $val (i64.load (i32.add (local.get $a_ptr) (i32.mul (local.get $i) (i32.const 8)))))
        (i64.store 
          (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (i64.or (i64.shr_u (local.get $val) (i64.const 1)) (i64.shl (local.get $borrow) (i64.const 63)))
        )
        (local.set $borrow (i64.and (local.get $val) (i64.const 1)))
        
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
  )
  
  ;; ===== バイナリ長除算 =====
  (func $div (param $dividend_ptr i32) (param $divisor_ptr i32) (param $quotient_ptr i32) (param $remainder_ptr i32) (param $limbs i32)
    (local $i i32)
    (local $bit_pos i32)
    (local $total_bits i32)
    (local $cmp_result i32)
    (local $temp_ptr i32)
    (local $limb_idx i32)
    (local $bit_in_limb i32)
    (local $mask i64)
    
    (local.set $temp_ptr (i32.const 16384))
    
    ;; 初期化 (最適化)
    (local.set $i (local.get $limbs))
    (block $init_q
      (loop $loop_q
        (br_if $init_q (i32.eqz (local.get $i)))
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (i64.store (i32.add (local.get $quotient_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
        (i64.store (i32.add (local.get $remainder_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
        (br $loop_q)
      )
    )
    
    (local.set $total_bits (i32.mul (local.get $limbs) (i32.const 64)))
    (local.set $bit_pos (i32.sub (local.get $total_bits) (i32.const 1)))
    
    (block $outer_break
      (loop $outer_loop
        (br_if $outer_break (i32.lt_s (local.get $bit_pos) (i32.const 0)))
        
        (call $shl1 (local.get $remainder_ptr) (local.get $temp_ptr) (local.get $limbs))
        
        ;; コピー (最適化)
        (local.set $i (local.get $limbs))
        (block $copy_break
          (loop $copy_loop
            (br_if $copy_break (i32.eqz (local.get $i)))
            (local.set $i (i32.sub (local.get $i) (i32.const 1)))
            (i64.store 
              (i32.add (local.get $remainder_ptr) (i32.mul (local.get $i) (i32.const 8)))
              (i64.load (i32.add (local.get $temp_ptr) (i32.mul (local.get $i) (i32.const 8))))
            )
            (br $copy_loop)
          )
        )
        
        (local.set $limb_idx (i32.div_u (local.get $bit_pos) (i32.const 64)))
        (local.set $bit_in_limb (i32.rem_u (local.get $bit_pos) (i32.const 64)))
        (local.set $mask (i64.shl (i64.const 1) (i64.extend_i32_u (local.get $bit_in_limb))))
        
        (if (i64.ne
              (i64.and
                (i64.load (i32.add (local.get $dividend_ptr) (i32.mul (local.get $limb_idx) (i32.const 8))))
                (local.get $mask)
              )
              (i64.const 0)
            )
          (then
            (i64.store (local.get $remainder_ptr) (i64.or (i64.load (local.get $remainder_ptr)) (i64.const 1)))
          )
        )
        
        (local.set $cmp_result (call $cmp (local.get $remainder_ptr) (local.get $divisor_ptr) (local.get $limbs)))
        
        (if (i32.ge_s (local.get $cmp_result) (i32.const 0))
          (then
            (call $sub (local.get $remainder_ptr) (local.get $divisor_ptr) (local.get $temp_ptr) (local.get $limbs))
            drop
            
            (local.set $i (local.get $limbs))
            (block $sub_copy_break
              (loop $sub_copy_loop
                (br_if $sub_copy_break (i32.eqz (local.get $i)))
                (local.set $i (i32.sub (local.get $i) (i32.const 1)))
                (i64.store 
                  (i32.add (local.get $remainder_ptr) (i32.mul (local.get $i) (i32.const 8)))
                  (i64.load (i32.add (local.get $temp_ptr) (i32.mul (local.get $i) (i32.const 8))))
                )
                (br $sub_copy_loop)
              )
            )
            
            (i64.store 
              (i32.add (local.get $quotient_ptr) (i32.mul (local.get $limb_idx) (i32.const 8)))
              (i64.or
                (i64.load (i32.add (local.get $quotient_ptr) (i32.mul (local.get $limb_idx) (i32.const 8))))
                (local.get $mask)
              )
            )
          )
        )
        
        (local.set $bit_pos (i32.sub (local.get $bit_pos) (i32.const 1)))
        (br $outer_loop)
      )
    )
  )
  
  ;; ===== 剰余演算 =====
  (func $mod (param $a_ptr i32) (param $n_ptr i32) (param $result_ptr i32) (param $a_limbs i32) (param $n_limbs i32)
    (local $quotient_ptr i32)
    (local $remainder_ptr i32)
    (local $temp_a_ptr i32)
    (local $temp_n_ptr i32)
    (local $i i32)
    (local $max_limbs i32)
    
    (local.set $quotient_ptr (i32.const 20000))
    (local.set $remainder_ptr (i32.const 25000))
    (local.set $temp_a_ptr (i32.const 100000))
    (local.set $temp_n_ptr (i32.const 110000))
    
    (local.set $max_limbs (select (local.get $a_limbs) (local.get $n_limbs) (i32.ge_u (local.get $a_limbs) (local.get $n_limbs))))
    
    ;; コピー (最適化版)
    (local.set $i (i32.const 0))
    (block $copy_break
      (loop $copy_loop
        (br_if $copy_break (i32.ge_u (local.get $i) (local.get $max_limbs)))
        
        (i64.store 
          (i32.add (local.get $temp_a_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (select 
            (i64.load (i32.add (local.get $a_ptr) (i32.mul (local.get $i) (i32.const 8))))
            (i64.const 0)
            (i32.lt_u (local.get $i) (local.get $a_limbs))
          )
        )
        
        (i64.store 
          (i32.add (local.get $temp_n_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (select 
            (i64.load (i32.add (local.get $n_ptr) (i32.mul (local.get $i) (i32.const 8))))
            (i64.const 0)
            (i32.lt_u (local.get $i) (local.get $n_limbs))
          )
        )
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $copy_loop)
      )
    )
    
    (call $div (local.get $temp_a_ptr) (local.get $temp_n_ptr) (local.get $quotient_ptr) (local.get $remainder_ptr) (local.get $max_limbs))
    
    (local.set $i (local.get $n_limbs))
    (block $copy_result_break
      (loop $copy_result_loop
        (br_if $copy_result_break (i32.eqz (local.get $i)))
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (i64.store 
          (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (i64.load (i32.add (local.get $remainder_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        (br $copy_result_loop)
      )
    )
  )
  
  ;; ===== バイナリ法 modExp =====
  (func $modExp (param $base_ptr i32) (param $exp_ptr i32) (param $mod_ptr i32) (param $result_ptr i32) (param $limbs i32)
    (local $i i32)
    (local $bit_pos i32)
    (local $total_bits i32)
    (local $temp_base_ptr i32)
    (local $temp_mul_ptr i32)
    (local $limb_idx i32)
    (local $bit_mask i64)
    
    (local.set $temp_base_ptr (i32.const 30000))
    (local.set $temp_mul_ptr (i32.const 35000))
    
    ;; 初期化
    (i64.store (local.get $result_ptr) (i64.const 1))
    (local.set $i (i32.const 1))
    (block $init_break
      (loop $init_loop
        (br_if $init_break (i32.ge_u (local.get $i) (local.get $limbs)))
        (i64.store (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $init_loop)
      )
    )
    
    (call $mod (local.get $base_ptr) (local.get $mod_ptr) (local.get $temp_base_ptr) (local.get $limbs) (local.get $limbs))
    
    (local.set $total_bits (i32.mul (local.get $limbs) (i32.const 64)))
    (local.set $bit_pos (i32.const 0))
    
    (block $outer_break
      (loop $outer_loop
        (br_if $outer_break (i32.ge_u (local.get $bit_pos) (local.get $total_bits)))
        
        (local.set $limb_idx (i32.div_u (local.get $bit_pos) (i32.const 64)))
        (local.set $bit_mask (i64.shl (i64.const 1) (i64.and (i64.extend_i32_u (local.get $bit_pos)) (i64.const 63))))
        
        (if (i64.ne
              (i64.and
                (i64.load (i32.add (local.get $exp_ptr) (i32.mul (local.get $limb_idx) (i32.const 8))))
                (local.get $bit_mask)
              )
              (i64.const 0)
            )
          (then
            (call $mul (local.get $result_ptr) (local.get $temp_base_ptr) (local.get $temp_mul_ptr) (local.get $limbs) (local.get $limbs))
            (call $mod (local.get $temp_mul_ptr) (local.get $mod_ptr) (local.get $result_ptr) (i32.mul (local.get $limbs) (i32.const 2)) (local.get $limbs))
          )
        )
        
        (call $mul (local.get $temp_base_ptr) (local.get $temp_base_ptr) (local.get $temp_mul_ptr) (local.get $limbs) (local.get $limbs))
        (call $mod (local.get $temp_mul_ptr) (local.get $mod_ptr) (local.get $temp_base_ptr) (i32.mul (local.get $limbs) (i32.const 2)) (local.get $limbs))
        
        (local.set $bit_pos (i32.add (local.get $bit_pos) (i32.const 1)))
        (br $outer_loop)
      )
    )
  )
  
  ;; ===== モンゴメリパラメータ計算 =====
  (func $computeNPrime (param $n_ptr i32) (result i64)
    (local $n0 i64)
    (local $n_prime i64)
    
    (local.set $n0 (i64.load (local.get $n_ptr)))
    (local.set $n_prime (local.get $n0))
    
    ;; ループ展開
    (local.set $n_prime (i64.mul (local.get $n_prime) (i64.sub (i64.const 2) (i64.mul (local.get $n0) (local.get $n_prime)))))
    (local.set $n_prime (i64.mul (local.get $n_prime) (i64.sub (i64.const 2) (i64.mul (local.get $n0) (local.get $n_prime)))))
    (local.set $n_prime (i64.mul (local.get $n_prime) (i64.sub (i64.const 2) (i64.mul (local.get $n0) (local.get $n_prime)))))
    (local.set $n_prime (i64.mul (local.get $n_prime) (i64.sub (i64.const 2) (i64.mul (local.get $n0) (local.get $n_prime)))))
    (local.set $n_prime (i64.mul (local.get $n_prime) (i64.sub (i64.const 2) (i64.mul (local.get $n0) (local.get $n_prime)))))
    
    (i64.sub (i64.const 0) (local.get $n_prime))
  )
  
  ;; ===== R^2 mod N を計算 (反復法) =====
  (func $computeR2 (param $n_ptr i32) (param $r2_ptr i32) (param $limbs i32)
    (local $i i32)
    (local $bit_count i32)
    (local $temp_ptr i32)
    (local $r_ptr i32)
    
    (local.set $temp_ptr (i32.const 120000))
    (local.set $r_ptr (i32.const 125000))
    
    ;; r = 1 で開始
    (i64.store (local.get $r_ptr) (i64.const 1))
    (local.set $i (i32.const 1))
    (block $clear_r
      (loop $clear_r_loop
        (br_if $clear_r (i32.ge_u (local.get $i) (local.get $limbs)))
        (i64.store (i32.add (local.get $r_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $clear_r_loop)
      )
    )
    
    ;; R mod N を計算: r を limbs*64 回左シフトして、毎回 N 以上なら N を引く
    (local.set $bit_count (i32.mul (local.get $limbs) (i32.const 64)))
    (local.set $i (i32.const 0))
    
    (block $shift_break
      (loop $shift_loop
        (br_if $shift_break (i32.ge_u (local.get $i) (local.get $bit_count)))
        
        ;; r = r << 1
        (call $shl1 (local.get $r_ptr) (local.get $temp_ptr) (local.get $limbs))
        (call $copy (local.get $temp_ptr) (local.get $r_ptr) (local.get $limbs))
        
        ;; if (r >= N) r = r - N
        (if (i32.ge_s (call $cmp (local.get $r_ptr) (local.get $n_ptr) (local.get $limbs)) (i32.const 0))
          (then
            (call $sub (local.get $r_ptr) (local.get $n_ptr) (local.get $temp_ptr) (local.get $limbs))
            (drop)
            (call $copy (local.get $temp_ptr) (local.get $r_ptr) (local.get $limbs))
          )
        )
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $shift_loop)
      )
    )
    
    ;; 今 r_ptr に R mod N が入っている
    ;; R^2 mod N = (R mod N) * (R mod N) mod N
    
    ;; temp_ptr をゼロクリア (2*limbs分)
    (local.set $i (i32.const 0))
    (block $clear_temp
      (loop $clear_temp_loop
        (br_if $clear_temp (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 2))))
        (i64.store (i32.add (local.get $temp_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $clear_temp_loop)
      )
    )
    
    ;; (R mod N) * (R mod N)
    (call $mul (local.get $r_ptr) (local.get $r_ptr) (local.get $temp_ptr) (local.get $limbs) (local.get $limbs))
    
    ;; 結果を r_ptr にコピー (下位 limbs のみ)
    (local.set $i (i32.const 0))
    (block $copy_mul
      (loop $copy_mul_loop
        (br_if $copy_mul (i32.ge_u (local.get $i) (local.get $limbs)))
        (i64.store 
          (i32.add (local.get $r_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (i64.load (i32.add (local.get $temp_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $copy_mul_loop)
      )
    )
    
    ;; もう一度 mod N (乗算結果が 2*limbs あるので)
    ;; 単純な方法: 繰り返し N を引く
    (block $reduce_break
      (loop $reduce_loop
        (br_if $reduce_break (i32.lt_s (call $cmp (local.get $r_ptr) (local.get $n_ptr) (local.get $limbs)) (i32.const 0)))
        
        (call $sub (local.get $r_ptr) (local.get $n_ptr) (local.get $temp_ptr) (local.get $limbs))
        (drop)
        (call $copy (local.get $temp_ptr) (local.get $r_ptr) (local.get $limbs))
        
        (br $reduce_loop)
      )
    )
    
    ;; 結果を r2_ptr にコピー
    (call $copy (local.get $r_ptr) (local.get $r2_ptr) (local.get $limbs))
  )
  
  ;; ===== モンゴメリリダクション (修正版) =====
  (func $montgomeryReduce (param $T_ptr i32) (param $N_ptr i32) (param $result_ptr i32) (param $limbs i32) (param $n_prime i64)
    (local $i i32)
    (local $j i32)
    (local $m i64)
    (local $c i64)
    (local $t i64)
    (local $T_ij i64)
    (local $N_j i64)
    (local $m_Nj_lo i64)
    (local $m_Nj_hi i64)
    (local $temp_ptr i32)
    (local $ij_offset i32)
    (local $i_limbs_offset i32)
    
    (local.set $temp_ptr (i32.const 50000))
    
    ;; T_ptrの上位部分をゼロクリア（念のため）
    (local.set $i (local.get $limbs))
    (block $clear_upper
      (loop $clear_loop
        (br_if $clear_upper (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 2))))
        (i64.store (i32.add (local.get $T_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $clear_loop)
      )
    )
    
    ;; メインループ
    (local.set $i (i32.const 0))
    (block $outer_break
      (loop $outer_loop
        (br_if $outer_break (i32.ge_u (local.get $i) (local.get $limbs)))
        
        ;; m = T[i] * n_prime (mod 2^64)
        (local.set $m 
          (i64.mul 
            (i64.load (i32.add (local.get $T_ptr) (i32.mul (local.get $i) (i32.const 8))))
            (local.get $n_prime)
          )
        )
        
        ;; c = 0
        (local.set $c (i64.const 0))
        
        ;; 内側ループ
        (local.set $j (i32.const 0))
        (block $inner_break
          (loop $inner_loop
            (br_if $inner_break (i32.ge_u (local.get $j) (local.get $limbs)))
            
            ;; T[i+j]のオフセット計算
            (local.set $ij_offset (i32.mul (i32.add (local.get $i) (local.get $j)) (i32.const 8)))
            
            ;; T[i+j]を読み込み
            (local.set $T_ij (i64.load (i32.add (local.get $T_ptr) (local.get $ij_offset))))
            
            ;; N[j]を読み込み
            (local.set $N_j (i64.load (i32.add (local.get $N_ptr) (i32.mul (local.get $j) (i32.const 8)))))
            
            ;; m * N[j] を128bitで計算
            (call $mul64x64 (local.get $m) (local.get $N_j) (local.get $temp_ptr))
            (local.set $m_Nj_lo (i64.load (local.get $temp_ptr)))
            (local.set $m_Nj_hi (i64.load (i32.add (local.get $temp_ptr) (i32.const 8))))
            
            ;; t = T[i+j] + m_Nj_lo + c
            (local.set $t (i64.add (local.get $T_ij) (local.get $m_Nj_lo)))
            
            ;; オーバーフロー check 1
            (if (i64.lt_u (local.get $t) (local.get $T_ij))
              (then
                (local.set $m_Nj_hi (i64.add (local.get $m_Nj_hi) (i64.const 1)))
              )
            )
            
            (local.set $T_ij (local.get $t))
            (local.set $t (i64.add (local.get $t) (local.get $c)))
            
            ;; オーバーフロー check 2
            (if (i64.lt_u (local.get $t) (local.get $T_ij))
              (then
                (local.set $m_Nj_hi (i64.add (local.get $m_Nj_hi) (i64.const 1)))
              )
            )
            
            ;; T[i+j] = t
            (i64.store (i32.add (local.get $T_ptr) (local.get $ij_offset)) (local.get $t))
            
            ;; c = m_Nj_hi
            (local.set $c (local.get $m_Nj_hi))
            
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $inner_loop)
          )
        )
        
        ;; T[i+limbs] += c
        (local.set $i_limbs_offset (i32.mul (i32.add (local.get $i) (local.get $limbs)) (i32.const 8)))
        (i64.store 
          (i32.add (local.get $T_ptr) (local.get $i_limbs_offset))
          (i64.add
            (i64.load (i32.add (local.get $T_ptr) (local.get $i_limbs_offset)))
            (local.get $c)
          )
        )
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $outer_loop)
      )
    )
    
    ;; result = T[limbs..2*limbs-1]
    (local.set $i (i32.const 0))
    (block $copy_break
      (loop $copy_loop
        (br_if $copy_break (i32.ge_u (local.get $i) (local.get $limbs)))
        
        (i64.store 
          (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (i64.load 
            (i32.add 
              (local.get $T_ptr) 
              (i32.mul (i32.add (local.get $i) (local.get $limbs)) (i32.const 8))
            )
          )
        )
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $copy_loop)
      )
    )
    
    ;; result >= N なら result -= N
    (if (i32.ge_s (call $cmp (local.get $result_ptr) (local.get $N_ptr) (local.get $limbs)) (i32.const 0))
      (then
        (call $sub (local.get $result_ptr) (local.get $N_ptr) (local.get $temp_ptr) (local.get $limbs))
        drop
        
        (local.set $i (i32.const 0))
        (block $final_copy_break
          (loop $final_copy_loop
            (br_if $final_copy_break (i32.ge_u (local.get $i) (local.get $limbs)))
            
            (i64.store 
              (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8)))
              (i64.load (i32.add (local.get $temp_ptr) (i32.mul (local.get $i) (i32.const 8))))
            )
            
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $final_copy_loop)
          )
        )
      )
    )
  )
  
  ;; ===== ビット取得 (インライン最適化) =====
  (func $getBit (param $ptr i32) (param $bit_idx i32) (result i32)
    (i32.wrap_i64 
      (i64.and 
        (i64.shr_u 
          (i64.load (i32.add (local.get $ptr) (i32.mul (i32.div_u (local.get $bit_idx) (i32.const 64)) (i32.const 8))))
          (i64.extend_i32_u (i32.rem_u (local.get $bit_idx) (i32.const 64)))
        )
        (i64.const 1)
      )
    )
  )

  ;; ===== メモリコピー (最適化版) =====
  (func $copy (param $src i32) (param $dst i32) (param $limbs i32)
    (local $i i32)
    (local.set $i (local.get $limbs))
    (block $break
      (loop $loop
        (br_if $break (i32.eqz (local.get $i)))
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (i64.store 
          (i32.add (local.get $dst) (i32.mul (local.get $i) (i32.const 8)))
          (i64.load (i32.add (local.get $src) (i32.mul (local.get $i) (i32.const 8))))
        )
        (br $loop)
      )
    )
  )

  ;; ===== スライディングウィンドウ Montgomery累乗 (最適化版) =====
  (func $modExpMontgomery (param $base_ptr i32) (param $exp_ptr i32) (param $mod_ptr i32) (param $result_ptr i32) (param $limbs i32)
    (local $i i32)
    (local $j i32)
    (local $scan_pos i32)
    (local $window_size i32)
    (local $w_val i32)
    (local $w_len i32)
    (local $n_prime i64)
    (local $n0 i64)
    (local $r2_ptr i32)
    (local $mont_base_ptr i32)
    (local $acc_ptr i32)
    (local $temp1_ptr i32)
    (local $temp2_ptr i32)
    (local $table_ptr i32)
    (local $table_elem_size i32)
    (local $table_idx i32)
    (local $bit_val i32)
    
    (local.set $window_size (i32.const 4))
    (local.set $r2_ptr (i32.const 130000))
    (local.set $mont_base_ptr (i32.const 140000))
    (local.set $acc_ptr (i32.const 150000))
    (local.set $temp1_ptr (i32.const 160000))
    (local.set $temp2_ptr (i32.const 170000))
    (local.set $table_ptr (i32.const 200000))
    (local.set $table_elem_size (i32.mul (local.get $limbs) (i32.const 8)))

    ;; 偶数チェック
    (local.set $n0 (i64.load (local.get $mod_ptr)))
    (if (i64.eq (i64.and (local.get $n0) (i64.const 1)) (i64.const 0))
      (then
        (call $modExp (local.get $base_ptr) (local.get $exp_ptr) (local.get $mod_ptr) (local.get $result_ptr) (local.get $limbs))
        (return)
      )
    )

    ;; 全作業領域をゼロ初期化（重要！）
    (local.set $i (i32.const 0))
    (block $clear_all_break
      (loop $clear_all_loop
        (br_if $clear_all_break (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 20))))
        (i64.store (i32.add (local.get $r2_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $clear_all_loop)
      )
    )

    ;; 初期化
    (local.set $n_prime (call $computeNPrime (local.get $mod_ptr)))
    (call $computeR2 (local.get $mod_ptr) (local.get $r2_ptr) (local.get $limbs))
    
    ;; Base -> Montgomery形式
    ;; temp1_ptr をゼロ初期化
    (local.set $i (i32.const 0))
    (block $clear_temp1
      (loop $clear_temp1_loop
        (br_if $clear_temp1 (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 2))))
        (i64.store (i32.add (local.get $temp1_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $clear_temp1_loop)
      )
    )
    
    (call $mul (local.get $base_ptr) (local.get $r2_ptr) (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs))
    (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $mont_base_ptr) (local.get $limbs) (local.get $n_prime))

    ;; 事前計算テーブル
    (call $copy (local.get $mont_base_ptr) (local.get $table_ptr) (local.get $limbs))
    
    ;; temp2 = Base^2
    (local.set $i (i32.const 0))
    (block $clear_temp1_2
      (loop $clear_temp1_2_loop
        (br_if $clear_temp1_2 (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 2))))
        (i64.store (i32.add (local.get $temp1_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $clear_temp1_2_loop)
      )
    )
    
    (call $mul (local.get $mont_base_ptr) (local.get $mont_base_ptr) (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs))
    (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $temp2_ptr) (local.get $limbs) (local.get $n_prime))
    
    ;; テーブル構築
    (local.set $i (i32.const 1))
    (block $pre_break
      (loop $pre_loop
        (br_if $pre_break (i32.ge_u (local.get $i) (i32.const 8)))
        
        ;; temp1_ptr をゼロクリア
        (local.set $j (i32.const 0))
        (block $clear_temp1_3
          (loop $clear_temp1_3_loop
            (br_if $clear_temp1_3 (i32.ge_u (local.get $j) (i32.mul (local.get $limbs) (i32.const 2))))
            (i64.store (i32.add (local.get $temp1_ptr) (i32.mul (local.get $j) (i32.const 8))) (i64.const 0))
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $clear_temp1_3_loop)
          )
        )
        
        (call $mul 
          (i32.add (local.get $table_ptr) (i32.mul (i32.sub (local.get $i) (i32.const 1)) (local.get $table_elem_size)))
          (local.get $temp2_ptr)
          (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs)
        )
        (call $montgomeryReduce 
          (local.get $temp1_ptr) (local.get $mod_ptr) 
          (i32.add (local.get $table_ptr) (i32.mul (local.get $i) (local.get $table_elem_size)))
          (local.get $limbs) (local.get $n_prime)
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $pre_loop)
      )
    )

    ;; Accumulator = 1 (Montgomery形式)
    ;; R^2 mod N を montgomeryReduce すると R mod N になる
    ;; r2_ptr を 2*limbs 分にコピー（上位はゼロ）
    (local.set $i (i32.const 0))
    (block $init_acc_copy
      (loop $init_acc_copy_loop
        (br_if $init_acc_copy (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 2))))
        
        (if (i32.lt_u (local.get $i) (local.get $limbs))
          (then
            ;; 下位部分: r2からコピー
            (i64.store 
              (i32.add (local.get $temp1_ptr) (i32.mul (local.get $i) (i32.const 8)))
              (i64.load (i32.add (local.get $r2_ptr) (i32.mul (local.get $i) (i32.const 8))))
            )
          )
          (else
            ;; 上位部分: ゼロ
            (i64.store 
              (i32.add (local.get $temp1_ptr) (i32.mul (local.get $i) (i32.const 8)))
              (i64.const 0)
            )
          )
        )
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $init_acc_copy_loop)
      )
    )
    
    (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $acc_ptr) (local.get $limbs) (local.get $n_prime))

    ;; MSB探索
    (local.set $scan_pos (i32.sub (i32.mul (local.get $limbs) (i32.const 64)) (i32.const 1)))
    (block $msb_break
      (loop $msb_loop
        (br_if $msb_break (i32.lt_s (local.get $scan_pos) (i32.const 0)))
        (if (call $getBit (local.get $exp_ptr) (local.get $scan_pos)) (then (br $msb_break)))
        (local.set $scan_pos (i32.sub (local.get $scan_pos) (i32.const 1)))
        (br $msb_loop)
      )
    )

    ;; スライディングウィンドウ本体
    (block $main_break
      (loop $main_loop
        (br_if $main_break (i32.lt_s (local.get $scan_pos) (i32.const 0)))
        
        (local.set $bit_val (call $getBit (local.get $exp_ptr) (local.get $scan_pos)))
        
        (if (i32.eqz (local.get $bit_val))
          (then
            ;; 2乗のみ
            ;; temp1_ptr をゼロクリア
            (local.set $j (i32.const 0))
            (block $clear_sq
              (loop $clear_sq_loop
                (br_if $clear_sq (i32.ge_u (local.get $j) (i32.mul (local.get $limbs) (i32.const 2))))
                (i64.store (i32.add (local.get $temp1_ptr) (i32.mul (local.get $j) (i32.const 8))) (i64.const 0))
                (local.set $j (i32.add (local.get $j) (i32.const 1)))
                (br $clear_sq_loop)
              )
            )
            
            (call $mul (local.get $acc_ptr) (local.get $acc_ptr) (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs))
            (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $acc_ptr) (local.get $limbs) (local.get $n_prime))
            (local.set $scan_pos (i32.sub (local.get $scan_pos) (i32.const 1)))
          )
          (else
            ;; ウィンドウ処理
            (local.set $w_len (i32.const 1))
            (local.set $w_val (i32.const 1))
            
            ;; ウィンドウ拡張
            (local.set $i (i32.const 1))
            (block $win_search_break
              (loop $win_search_loop
                (br_if $win_search_break (i32.ge_s (local.get $i) (local.get $window_size)))
                (br_if $win_search_break (i32.lt_s (i32.sub (local.get $scan_pos) (local.get $i)) (i32.const 0)))
                
                (if (call $getBit (local.get $exp_ptr) (i32.sub (local.get $scan_pos) (local.get $i)))
                  (then (local.set $w_len (i32.add (local.get $i) (i32.const 1))))
                )
                (local.set $i (i32.add (local.get $i) (i32.const 1)))
                (br $win_search_loop)
              )
            )
            
            ;; ウィンドウ値計算
            (local.set $w_val (i32.const 0))
            (local.set $j (i32.const 0))
            (block $val_calc_break
              (loop $val_calc_loop
                (br_if $val_calc_break (i32.ge_s (local.get $j) (local.get $w_len)))
                (local.set $w_val (i32.shl (local.get $w_val) (i32.const 1)))
                (if (call $getBit (local.get $exp_ptr) (i32.sub (local.get $scan_pos) (local.get $j)))
                  (then (local.set $w_val (i32.or (local.get $w_val) (i32.const 1))))
                )
                (local.set $j (i32.add (local.get $j) (i32.const 1)))
                (br $val_calc_loop)
              )
            )
            
            ;; w_len回2乗
            (local.set $j (i32.const 0))
            (block $sq_break
              (loop $sq_loop
                (br_if $sq_break (i32.ge_s (local.get $j) (local.get $w_len)))
                
                ;; temp1_ptr をゼロクリア
                (local.set $i (i32.const 0))
                (block $clear_sq_w
                  (loop $clear_sq_w_loop
                    (br_if $clear_sq_w (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 2))))
                    (i64.store (i32.add (local.get $temp1_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
                    (local.set $i (i32.add (local.get $i) (i32.const 1)))
                    (br $clear_sq_w_loop)
                  )
                )
                
                (call $mul (local.get $acc_ptr) (local.get $acc_ptr) (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs))
                (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $acc_ptr) (local.get $limbs) (local.get $n_prime))
                (local.set $j (i32.add (local.get $j) (i32.const 1)))
                (br $sq_loop)
              )
            )
            
            ;; テーブル掛け算
            (local.set $table_idx (i32.shr_u (local.get $w_val) (i32.const 1)))
            
            ;; temp1_ptr をゼロクリア
            (local.set $i (i32.const 0))
            (block $clear_mul
              (loop $clear_mul_loop
                (br_if $clear_mul (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 2))))
                (i64.store (i32.add (local.get $temp1_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
                (local.set $i (i32.add (local.get $i) (i32.const 1)))
                (br $clear_mul_loop)
              )
            )
            
            (call $mul 
              (local.get $acc_ptr) 
              (i32.add (local.get $table_ptr) (i32.mul (local.get $table_idx) (local.get $table_elem_size)))
              (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs)
            )
            (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $acc_ptr) (local.get $limbs) (local.get $n_prime))
            
            (local.set $scan_pos (i32.sub (local.get $scan_pos) (local.get $w_len)))
          )
        )
        (br $main_loop)
      )
    )

    ;; Montgomery形式解除
    ;; acc_ptr には Montgomery 形式の結果 (result * R mod N) が入っている
    ;; 通常形式に戻すには montgomeryReduce(acc, N, result, limbs, n_prime) を実行
    ;; これにより acc * R^(-1) mod N が計算される
    
    ;; temp2_ptr に acc をコピーし、上位部分をゼロクリア (2*limbs分用意)
    (local.set $i (i32.const 0))
    (block $copy_acc
      (loop $copy_acc_loop
        (br_if $copy_acc (i32.ge_u (local.get $i) (local.get $limbs)))
        (i64.store 
          (i32.add (local.get $temp2_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (i64.load (i32.add (local.get $acc_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $copy_acc_loop)
      )
    )
    
    ;; 上位部分をゼロクリア
    (block $clear_upper_final
      (loop $clear_upper_final_loop
        (br_if $clear_upper_final (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 2))))
        (i64.store (i32.add (local.get $temp2_ptr) (i32.mul (local.get $i) (i32.const 8))) (i64.const 0))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $clear_upper_final_loop)
      )
    )
    
    ;; Montgomery リダクションを実行して通常形式に戻す
    (call $montgomeryReduce (local.get $temp2_ptr) (local.get $mod_ptr) (local.get $result_ptr) (local.get $limbs) (local.get $n_prime))
  )
  
  ;; ===== エクスポート =====
  (export "add" (func $add))
  (export "sub" (func $sub))
  (export "mul" (func $mul))
  (export "div" (func $div))
  (export "cmp" (func $cmp))
  (export "mod" (func $mod))
  (export "modExp" (func $modExp))
  (export "modExpMontgomery" (func $modExpMontgomery))
)