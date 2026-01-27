(module
  (memory (export "memory") 512)
  
  (global $MAX_LIMBS i32 (i32.const 256))
  
  ;; ===== 多倍長加算 =====
  (func $add (param $a_ptr i32) (param $b_ptr i32) (param $result_ptr i32) (param $limbs i32) (result i32)
    (local $i i32)
    (local $carry i64)
    (local $a_val i64)
    (local $b_val i64)
    (local $sum i64)
    
    (local.set $i (i32.const 0))
    (local.set $carry (i64.const 0))
    
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $limbs)))
        
        (local.set $a_val 
          (i64.load (i32.add (local.get $a_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        
        (local.set $b_val 
          (i64.load (i32.add (local.get $b_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        
        (local.set $sum (i64.add (i64.add (local.get $a_val) (local.get $b_val)) (local.get $carry)))
        
        (i64.store 
          (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (local.get $sum)
        )
        
        (local.set $carry 
          (i64.extend_i32_u
            (i32.or
              (i64.lt_u (i64.add (local.get $a_val) (local.get $carry)) (local.get $a_val))
              (i64.lt_u (local.get $sum) (local.get $b_val))
            )
          )
        )
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
    
    (i32.wrap_i64 (local.get $carry))
  )
  
  ;; ===== 多倍長減算 =====
  (func $sub (param $a_ptr i32) (param $b_ptr i32) (param $result_ptr i32) (param $limbs i32) (result i32)
    (local $i i32)
    (local $borrow i64)
    (local $a_val i64)
    (local $b_val i64)
    (local $diff i64)
    
    (local.set $i (i32.const 0))
    (local.set $borrow (i64.const 0))
    
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $limbs)))
        
        (local.set $a_val 
          (i64.load (i32.add (local.get $a_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        
        (local.set $b_val 
          (i64.load (i32.add (local.get $b_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        
        (local.set $diff 
          (i64.sub 
            (i64.sub (local.get $a_val) (local.get $b_val)) 
            (local.get $borrow)
          )
        )
        
        (i64.store 
          (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (local.get $diff)
        )
        
        (local.set $borrow 
          (i64.extend_i32_u
            (i32.or
              (i64.gt_u (local.get $b_val) (local.get $a_val))
              (i64.gt_u (i64.add (local.get $b_val) (local.get $borrow)) (local.get $a_val))
            )
          )
        )
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
    
    (i32.wrap_i64 (local.get $borrow))
  )
  
  ;; ===== 64×64→128 乗算 =====
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
  
  ;; ===== 多倍長乗算 =====
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
    
    (local.set $temp_ptr (i32.const 8192))
    
    (local.set $i (i32.const 0))
    (block $init_break
      (loop $init_loop
        (br_if $init_break (i32.ge_u (local.get $i) (i32.add (local.get $a_limbs) (local.get $b_limbs))))
        (i64.store 
          (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (i64.const 0)
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $init_loop)
      )
    )
    
    (local.set $i (i32.const 0))
    (block $outer_break
      (loop $outer_loop
        (br_if $outer_break (i32.ge_u (local.get $i) (local.get $a_limbs)))
        
        (local.set $a_val 
          (i64.load (i32.add (local.get $a_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        
        (local.set $j (i32.const 0))
        (local.set $carry (i64.const 0))
        
        (block $inner_break
          (loop $inner_loop
            (br_if $inner_break (i32.ge_u (local.get $j) (local.get $b_limbs)))
            
            (local.set $b_val 
              (i64.load (i32.add (local.get $b_ptr) (i32.mul (local.get $j) (i32.const 8))))
            )
            
            (call $mul64x64 (local.get $a_val) (local.get $b_val) (local.get $temp_ptr))
            (local.set $prod_lo (i64.load (local.get $temp_ptr)))
            (local.set $prod_hi (i64.load (i32.add (local.get $temp_ptr) (i32.const 8))))
            
            (local.set $result_idx (i32.add (local.get $i) (local.get $j)))
            (local.set $sum 
              (i64.load (i32.add (local.get $result_ptr) (i32.mul (local.get $result_idx) (i32.const 8))))
            )
            
            (local.set $old_sum (local.get $sum))
            (local.set $sum (i64.add (local.get $sum) (local.get $prod_lo)))
            (if (i64.lt_u (local.get $sum) (local.get $old_sum))
              (then
                (local.set $prod_hi (i64.add (local.get $prod_hi) (i64.const 1)))
              )
            )
            
            (local.set $old_sum (local.get $sum))
            (local.set $sum (i64.add (local.get $sum) (local.get $carry)))
            (if (i64.lt_u (local.get $sum) (local.get $old_sum))
              (then
                (local.set $prod_hi (i64.add (local.get $prod_hi) (i64.const 1)))
              )
            )
            
            (i64.store 
              (i32.add (local.get $result_ptr) (i32.mul (local.get $result_idx) (i32.const 8)))
              (local.get $sum)
            )
            
            (local.set $carry (local.get $prod_hi))
            
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $inner_loop)
          )
        )
        
        (if (i64.ne (local.get $carry) (i64.const 0))
          (then
            (local.set $result_idx (i32.add (local.get $i) (local.get $b_limbs)))
            (i64.store 
              (i32.add (local.get $result_ptr) (i32.mul (local.get $result_idx) (i32.const 8)))
              (local.get $carry)
            )
          )
        )
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $outer_loop)
      )
    )
  )
  
  ;; ===== 比較関数 =====
  (func $cmp (param $a_ptr i32) (param $b_ptr i32) (param $limbs i32) (result i32)
    (local $i i32)
    (local $a_val i64)
    (local $b_val i64)
    
    (local.set $i (i32.sub (local.get $limbs) (i32.const 1)))
    
    (block $break
      (loop $loop
        (br_if $break (i32.lt_s (local.get $i) (i32.const 0)))
        
        (local.set $a_val 
          (i64.load (i32.add (local.get $a_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        
        (local.set $b_val 
          (i64.load (i32.add (local.get $b_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        
        (if (i64.gt_u (local.get $a_val) (local.get $b_val))
          (then
            (return (i32.const 1))
          )
        )
        
        (if (i64.lt_u (local.get $a_val) (local.get $b_val))
          (then
            (return (i32.const -1))
          )
        )
        
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
        
        (local.set $val 
          (i64.load (i32.add (local.get $a_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        
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
        
        (local.set $val 
          (i64.load (i32.add (local.get $a_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        
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
    
    (local.set $temp_ptr (i32.const 16384))
    
    (local.set $i (i32.const 0))
    (block $init_q
      (loop $loop_q
        (br_if $init_q (i32.ge_u (local.get $i) (local.get $limbs)))
        (i64.store 
          (i32.add (local.get $quotient_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (i64.const 0)
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop_q)
      )
    )
    
    (local.set $i (i32.const 0))
    (block $init_r
      (loop $loop_r
        (br_if $init_r (i32.ge_u (local.get $i) (local.get $limbs)))
        (i64.store 
          (i32.add (local.get $remainder_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (i64.const 0)
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop_r)
      )
    )
    
    (local.set $total_bits (i32.mul (local.get $limbs) (i32.const 64)))
    (local.set $bit_pos (i32.sub (local.get $total_bits) (i32.const 1)))
    
    (block $outer_break
      (loop $outer_loop
        (br_if $outer_break (i32.lt_s (local.get $bit_pos) (i32.const 0)))
        
        (call $shl1 (local.get $remainder_ptr) (local.get $temp_ptr) (local.get $limbs))
        
        (local.set $i (i32.const 0))
        (block $copy_break
          (loop $copy_loop
            (br_if $copy_break (i32.ge_u (local.get $i) (local.get $limbs)))
            (i64.store 
              (i32.add (local.get $remainder_ptr) (i32.mul (local.get $i) (i32.const 8)))
              (i64.load (i32.add (local.get $temp_ptr) (i32.mul (local.get $i) (i32.const 8))))
            )
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $copy_loop)
          )
        )
        
        (local.set $i (i32.div_u (local.get $bit_pos) (i32.const 64)))
        (if (i64.ne
              (i64.and
                (i64.load (i32.add (local.get $dividend_ptr) (i32.mul (local.get $i) (i32.const 8))))
                (i64.shl (i64.const 1) (i64.and (i64.extend_i32_u (local.get $bit_pos)) (i64.const 63)))
              )
              (i64.const 0)
            )
          (then
            (i64.store 
              (local.get $remainder_ptr)
              (i64.or (i64.load (local.get $remainder_ptr)) (i64.const 1))
            )
          )
        )
        
        (local.set $cmp_result (call $cmp (local.get $remainder_ptr) (local.get $divisor_ptr) (local.get $limbs)))
        
        (if (i32.ge_s (local.get $cmp_result) (i32.const 0))
          (then
            (call $sub (local.get $remainder_ptr) (local.get $divisor_ptr) (local.get $temp_ptr) (local.get $limbs))
            drop
            
            (local.set $i (i32.const 0))
            (block $sub_copy_break
              (loop $sub_copy_loop
                (br_if $sub_copy_break (i32.ge_u (local.get $i) (local.get $limbs)))
                (i64.store 
                  (i32.add (local.get $remainder_ptr) (i32.mul (local.get $i) (i32.const 8)))
                  (i64.load (i32.add (local.get $temp_ptr) (i32.mul (local.get $i) (i32.const 8))))
                )
                (local.set $i (i32.add (local.get $i) (i32.const 1)))
                (br $sub_copy_loop)
              )
            )
            
            (local.set $i (i32.div_u (local.get $bit_pos) (i32.const 64)))
            (i64.store 
              (i32.add (local.get $quotient_ptr) (i32.mul (local.get $i) (i32.const 8)))
              (i64.or
                (i64.load (i32.add (local.get $quotient_ptr) (i32.mul (local.get $i) (i32.const 8))))
                (i64.shl (i64.const 1) (i64.and (i64.extend_i32_u (local.get $bit_pos)) (i64.const 63)))
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
    
    (local.set $max_limbs (local.get $a_limbs))
    (if (i32.lt_u (local.get $max_limbs) (local.get $n_limbs))
      (then
        (local.set $max_limbs (local.get $n_limbs))
      )
    )
    
    (local.set $i (i32.const 0))
    (block $copy_a_break
      (loop $copy_a_loop
        (br_if $copy_a_break (i32.ge_u (local.get $i) (local.get $max_limbs)))
        (i64.store 
          (i32.add (local.get $temp_a_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (if (result i64) (i32.lt_u (local.get $i) (local.get $a_limbs))
            (then
              (i64.load (i32.add (local.get $a_ptr) (i32.mul (local.get $i) (i32.const 8))))
            )
            (else
              (i64.const 0)
            )
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $copy_a_loop)
      )
    )
    
    (local.set $i (i32.const 0))
    (block $copy_n_break
      (loop $copy_n_loop
        (br_if $copy_n_break (i32.ge_u (local.get $i) (local.get $max_limbs)))
        (i64.store 
          (i32.add (local.get $temp_n_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (if (result i64) (i32.lt_u (local.get $i) (local.get $n_limbs))
            (then
              (i64.load (i32.add (local.get $n_ptr) (i32.mul (local.get $i) (i32.const 8))))
            )
            (else
              (i64.const 0)
            )
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $copy_n_loop)
      )
    )
    
    (call $div (local.get $temp_a_ptr) (local.get $temp_n_ptr) (local.get $quotient_ptr) (local.get $remainder_ptr) (local.get $max_limbs))
    
    (local.set $i (i32.const 0))
    (block $copy_result_break
      (loop $copy_result_loop
        (br_if $copy_result_break (i32.ge_u (local.get $i) (local.get $n_limbs)))
        (i64.store 
          (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (i64.load (i32.add (local.get $remainder_ptr) (i32.mul (local.get $i) (i32.const 8))))
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
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
    
    (local.set $i (i32.const 0))
    (block $init_break
      (loop $init_loop
        (br_if $init_break (i32.ge_u (local.get $i) (local.get $limbs)))
        (i64.store 
          (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (if (result i64) (i32.eq (local.get $i) (i32.const 0))
            (then (i64.const 1))
            (else (i64.const 0))
          )
        )
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
        (local.set $bit_mask 
          (i64.shl (i64.const 1) (i64.and (i64.extend_i32_u (local.get $bit_pos)) (i64.const 63)))
        )
        
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
    (local $i i32)
    
    (local.set $n0 (i64.load (local.get $n_ptr)))
    (local.set $n_prime (local.get $n0))
    
    (local.set $i (i32.const 0))
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (i32.const 5)))
        
        (local.set $n_prime
          (i64.mul
            (local.get $n_prime)
            (i64.sub
              (i64.const 2)
              (i64.mul (local.get $n0) (local.get $n_prime))
            )
          )
        )
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
    
    (i64.sub (i64.const 0) (local.get $n_prime))
  )
  
  ;; ===== R^2 mod N を計算 =====
  (func $computeR2 (param $n_ptr i32) (param $r2_ptr i32) (param $limbs i32)
    (local $i i32)
    (local $temp_ptr i32)
    
    (local.set $temp_ptr (i32.const 120000))
    
    (local.set $i (i32.const 0))
    (block $init_break
      (loop $init_loop
        (br_if $init_break (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 2))))
        (i64.store 
          (i32.add (local.get $temp_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (if (result i64) (i32.eq (local.get $i) (local.get $limbs))
            (then (i64.const 1))
            (else (i64.const 0))
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $init_loop)
      )
    )
    
    (call $mod (local.get $temp_ptr) (local.get $n_ptr) (local.get $r2_ptr) (i32.mul (local.get $limbs) (i32.const 2)) (local.get $limbs))
    (call $mul (local.get $r2_ptr) (local.get $r2_ptr) (local.get $temp_ptr) (local.get $limbs) (local.get $limbs))
    (call $mod (local.get $temp_ptr) (local.get $n_ptr) (local.get $r2_ptr) (i32.mul (local.get $limbs) (i32.const 2)) (local.get $limbs))
  )
  
  ;; ===== モンゴメリリダクション =====
  (func $montgomeryReduce (param $T_ptr i32) (param $N_ptr i32) (param $result_ptr i32) (param $limbs i32) (param $n_prime i64)
    (local $i i32)
    (local $j i32)
    (local $m i64)
    (local $carry i64)
    (local $prod_lo i64)
    (local $prod_hi i64)
    (local $sum i64)
    (local $old_sum i64)
    (local $temp_ptr i32)
    
    (local.set $temp_ptr (i32.const 50000))
    
    (local.set $i (i32.const 0))
    
    (block $outer_break
      (loop $outer_loop
        (br_if $outer_break (i32.ge_u (local.get $i) (local.get $limbs)))
        
        (local.set $m 
          (i64.mul
            (i64.load (i32.add (local.get $T_ptr) (i32.mul (local.get $i) (i32.const 8))))
            (local.get $n_prime)
          )
        )
        
        (local.set $carry (i64.const 0))
        (local.set $j (i32.const 0))
        
        (block $inner_break
          (loop $inner_loop
            (br_if $inner_break (i32.ge_u (local.get $j) (local.get $limbs)))
            
            (call $mul64x64 
              (local.get $m) 
              (i64.load (i32.add (local.get $N_ptr) (i32.mul (local.get $j) (i32.const 8))))
              (local.get $temp_ptr)
            )
            (local.set $prod_lo (i64.load (local.get $temp_ptr)))
            (local.set $prod_hi (i64.load (i32.add (local.get $temp_ptr) (i32.const 8))))
            
            (local.set $sum 
              (i64.load (i32.add (local.get $T_ptr) (i32.mul (i32.add (local.get $i) (local.get $j)) (i32.const 8))))
            )
            
            (local.set $old_sum (local.get $sum))
            (local.set $sum (i64.add (local.get $sum) (local.get $prod_lo)))
            (if (i64.lt_u (local.get $sum) (local.get $old_sum))
              (then
                (local.set $prod_hi (i64.add (local.get $prod_hi) (i64.const 1)))
              )
            )
            
            (local.set $old_sum (local.get $sum))
            (local.set $sum (i64.add (local.get $sum) (local.get $carry)))
            (if (i64.lt_u (local.get $sum) (local.get $old_sum))
              (then
                (local.set $prod_hi (i64.add (local.get $prod_hi) (i64.const 1)))
              )
            )
            
            (i64.store 
              (i32.add (local.get $T_ptr) (i32.mul (i32.add (local.get $i) (local.get $j)) (i32.const 8)))
              (local.get $sum)
            )
            
            (local.set $carry (local.get $prod_hi))
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $inner_loop)
          )
        )
        
        (if (i64.ne (local.get $carry) (i64.const 0))
          (then
            (local.set $j (i32.add (local.get $i) (local.get $limbs)))
            (i64.store 
              (i32.add (local.get $T_ptr) (i32.mul (local.get $j) (i32.const 8)))
              (i64.add
                (i64.load (i32.add (local.get $T_ptr) (i32.mul (local.get $j) (i32.const 8))))
                (local.get $carry)
              )
            )
          )
        )
        
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $outer_loop)
      )
    )
    
    (local.set $i (i32.const 0))
    (block $copy_break
      (loop $copy_loop
        (br_if $copy_break (i32.ge_u (local.get $i) (local.get $limbs)))
        (i64.store 
          (i32.add (local.get $result_ptr) (i32.mul (local.get $i) (i32.const 8)))
          (i64.load (i32.add (local.get $T_ptr) (i32.mul (i32.add (local.get $i) (local.get $limbs)) (i32.const 8))))
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $copy_loop)
      )
    )
    
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
  
  ;; ===== モンゴメリ modExp（偶数対応版）=====
(func $copy (param $dst i32) (param $src i32) (param $limbs i32)
  (local $i i32)
  (local.set $i (i32.const 0))
  (block $break
    (loop $continue
      (br_if $break (i32.ge_u (local.get $i) (local.get $limbs)))
      (i64.store
        (i32.add (local.get $dst) (i32.shl (local.get $i) (i32.const 3)))
        (i64.load (i32.add (local.get $src) (i32.shl (local.get $i) (i32.const 3))))
      )
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $continue)
    )
  )
)
(func $modExpMontgomery (param $base_ptr i32) (param $exp_ptr i32) (param $mod_ptr i32) (param $result_ptr i32) (param $limbs i32)
  (local $i i32)
  (local $j i32)
  (local $bit_pos i32)
  (local $total_bits i32)
  (local $n_prime i64)
  (local $n0 i64)
  (local $r2_ptr i32)
  (local $mont_base_ptr i32)
  (local $mont_result_ptr i32)
  (local $temp1_ptr i32)
  (local $temp2_ptr i32)
  (local $limb_idx i32)
  (local $bit_mask i64)
  (local $bit i32)
  
  ;; スライディングウィンドウ用変数
  (local $k i32)              ;; ウィンドウサイズ
  (local $table_size i32)     ;; テーブルサイズ = 2^(k-1)
  (local $table_ptr i32)      ;; プリコンピュートテーブルのベースアドレス
  (local $base_squared_ptr i32) ;; base^2 用
  (local $win_size i32)       ;; 現在のウィンドウサイズ
  (local $win_val i32)        ;; ウィンドウ値
  (local $max_win_size i32)   ;; 最大ウィンドウサイズ
  (local $s i32)              ;; ループカウンタ
  (local $table_idx i32)      ;; テーブルインデックス
  
  ;; N[0] が偶数かチェック
  (local.set $n0 (i64.load (local.get $mod_ptr)))
  (if (i64.eq (i64.and (local.get $n0) (i64.const 1)) (i64.const 0))
    (then
      ;; Nが偶数 → バイナリ法を呼ぶ
      (call $modExp (local.get $base_ptr) (local.get $exp_ptr) (local.get $mod_ptr) (local.get $result_ptr) (local.get $limbs))
      (return)
    )
  )
  
  ;; temp領域設定
  (local.set $r2_ptr (i32.const 130000))
  (local.set $mont_base_ptr (i32.const 140000))
  (local.set $mont_result_ptr (i32.const 150000))
  (local.set $temp1_ptr (i32.const 160000))
  (local.set $temp2_ptr (i32.const 170000))
  (local.set $base_squared_ptr (i32.const 180000))
  (local.set $table_ptr (i32.const 200000))  ;; テーブル用メモリ領域
  
  ;; ウィンドウサイズを決定 (k = 5)
  (local.set $k (i32.const 5))
  (local.set $table_size (i32.shl (i32.const 1) (i32.sub (local.get $k) (i32.const 1))))  ;; 2^(k-1) = 16
  
  ;; n_prime を計算
  (local.set $n_prime (call $computeNPrime (local.get $mod_ptr)))
  
  ;; R^2 mod N を計算
  (call $computeR2 (local.get $mod_ptr) (local.get $r2_ptr) (local.get $limbs))
  
  ;; mont_base = (base * R^2) * R^-1 mod N
  (call $mul (local.get $base_ptr) (local.get $r2_ptr) (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs))
  (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $mont_base_ptr) (local.get $limbs) (local.get $n_prime))
  
  ;; base_squared = mont_base^2
  (call $mul (local.get $mont_base_ptr) (local.get $mont_base_ptr) (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs))
  (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $base_squared_ptr) (local.get $limbs) (local.get $n_prime))
  
  ;; プリコンピュートテーブル作成
  ;; table[0] = mont_base
  (call $copy 
    (local.get $table_ptr) 
    (local.get $mont_base_ptr) 
    (local.get $limbs)
  )
  
  ;; table[i] = table[i-1] * base_squared (for i = 1 to table_size-1)
  (local.set $i (i32.const 1))
  (block $table_break
    (loop $table_loop
      (br_if $table_break (i32.ge_u (local.get $i) (local.get $table_size)))
      
      ;; table[i] = table[i-1] * base_squared
      (call $mul 
        (i32.add 
          (local.get $table_ptr) 
          (i32.mul (i32.mul (i32.sub (local.get $i) (i32.const 1)) (local.get $limbs)) (i32.const 8))
        )
        (local.get $base_squared_ptr)
        (local.get $temp1_ptr)
        (local.get $limbs)
        (local.get $limbs)
      )
      
      (call $montgomeryReduce 
        (local.get $temp1_ptr) 
        (local.get $mod_ptr) 
        (i32.add 
          (local.get $table_ptr) 
          (i32.mul (i32.mul (local.get $i) (local.get $limbs)) (i32.const 8))
        )
        (local.get $limbs) 
        (local.get $n_prime)
      )
      
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $table_loop)
    )
  )
  
  ;; mont_result = R mod N（Montgomery形式の1）
  (local.set $i (i32.const 0))
  (block $init_r_break
    (loop $init_r_loop
      (br_if $init_r_break (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 2))))
      (i64.store 
        (i32.add (local.get $temp1_ptr) (i32.mul (local.get $i) (i32.const 8)))
        (if (result i64) (i32.eq (local.get $i) (local.get $limbs))
          (then (i64.const 1))
          (else (i64.const 0))
        )
      )
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $init_r_loop)
    )
  )
  
  (call $mod (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $mont_result_ptr) (i32.mul (local.get $limbs) (i32.const 2)) (local.get $limbs))
  
  ;; ビット長を計算（最上位の非ゼロビットを探す）
  (local.set $total_bits (i32.const 0))
  (local.set $i (local.get $limbs))
  
  (block $find_bits_break
    (loop $find_bits_loop
      (br_if $find_bits_break (i32.eqz (local.get $i)))
      (local.set $i (i32.sub (local.get $i) (i32.const 1)))
      
      (if (i64.ne 
            (i64.load (i32.add (local.get $exp_ptr) (i32.mul (local.get $i) (i32.const 8))))
            (i64.const 0)
          )
        (then
          ;; この limb にビットがある
          (local.set $total_bits 
            (i32.add 
              (i32.mul (i32.add (local.get $i) (i32.const 1)) (i32.const 64))
              (i32.const 0)
            )
          )
          (br $find_bits_break)
        )
      )
      
      (br $find_bits_loop)
    )
  )
  
  (if (i32.eqz (local.get $total_bits))
    (then
      ;; 指数が0の場合、結果は1
      (return)
    )
  )
  
  ;; スライディングウィンドウによるべき乗計算（右から左へ）
  (local.set $bit_pos (i32.sub (local.get $total_bits) (i32.const 1)))
  
  (block $window_outer_break
    (loop $window_outer_loop
      (br_if $window_outer_break (i32.lt_s (local.get $bit_pos) (i32.const 0)))
      
      ;; 現在のビットを取得
      (local.set $limb_idx (i32.div_u (local.get $bit_pos) (i32.const 64)))
      (local.set $bit_mask 
        (i64.shl (i64.const 1) (i64.and (i64.extend_i32_u (local.get $bit_pos)) (i64.const 63)))
      )
      
      (local.set $bit
        (if (result i32)
          (i64.ne
            (i64.and
              (i64.load (i32.add (local.get $exp_ptr) (i32.mul (local.get $limb_idx) (i32.const 8))))
              (local.get $bit_mask)
            )
            (i64.const 0)
          )
          (then (i32.const 1))
          (else (i32.const 0))
        )
      )
      
      (if (i32.eqz (local.get $bit))
        (then
          ;; ビットが0の場合: result = result^2
          (call $mul (local.get $mont_result_ptr) (local.get $mont_result_ptr) (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs))
          (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $mont_result_ptr) (local.get $limbs) (local.get $n_prime))
          (local.set $bit_pos (i32.sub (local.get $bit_pos) (i32.const 1)))
        )
        (else
          ;; ビットが1の場合: ウィンドウを読み取る
          (local.set $win_size (i32.const 1))
          (local.set $win_val (i32.const 1))
          (local.set $max_win_size 
            (if (result i32) (i32.lt_s (i32.add (local.get $bit_pos) (i32.const 1)) (local.get $k))
              (then (i32.add (local.get $bit_pos) (i32.const 1)))
              (else (local.get $k))
            )
          )
          
          ;; ウィンドウを読み取る
          (local.set $j (i32.const 1))
          (block $read_window_break
            (loop $read_window_loop
              (br_if $read_window_break (i32.ge_u (local.get $j) (local.get $max_win_size)))
              
              (local.set $limb_idx (i32.div_u (i32.sub (local.get $bit_pos) (local.get $j)) (i32.const 64)))
              (local.set $bit_mask 
                (i64.shl (i64.const 1) (i64.and (i64.extend_i32_u (i32.sub (local.get $bit_pos) (local.get $j))) (i64.const 63)))
              )
              
              (local.set $bit
                (if (result i32)
                  (i64.ne
                    (i64.and
                      (i64.load (i32.add (local.get $exp_ptr) (i32.mul (local.get $limb_idx) (i32.const 8))))
                      (local.get $bit_mask)
                    )
                    (i64.const 0)
                  )
                  (then (i32.const 1))
                  (else (i32.const 0))
                )
              )
              
              (local.set $win_val (i32.or (i32.shl (local.get $win_val) (i32.const 1)) (local.get $bit)))
              (local.set $win_size (i32.add (local.get $j) (i32.const 1)))
              
              (local.set $j (i32.add (local.get $j) (i32.const 1)))
              (br $read_window_loop)
            )
          )
          
          ;; ウィンドウが奇数になるまで縮小
          (block $shrink_window_break
            (loop $shrink_window_loop
              (br_if $shrink_window_break (i32.le_u (local.get $win_size) (i32.const 1)))
              (br_if $shrink_window_break (i32.eq (i32.and (local.get $win_val) (i32.const 1)) (i32.const 1)))
              
              (local.set $win_val (i32.shr_u (local.get $win_val) (i32.const 1)))
              (local.set $win_size (i32.sub (local.get $win_size) (i32.const 1)))
              (br $shrink_window_loop)
            )
          )
          
          ;; win_size 回 2乗
          (local.set $s (i32.const 0))
          (block $square_break
            (loop $square_loop
              (br_if $square_break (i32.ge_u (local.get $s) (local.get $win_size)))
              
              (call $mul (local.get $mont_result_ptr) (local.get $mont_result_ptr) (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs))
              (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $mont_result_ptr) (local.get $limbs) (local.get $n_prime))
              
              (local.set $s (i32.add (local.get $s) (i32.const 1)))
              (br $square_loop)
            )
          )
          
          ;; result = result * table[win_val >> 1]
          (local.set $table_idx (i32.shr_u (local.get $win_val) (i32.const 1)))
          
          (call $mul 
            (local.get $mont_result_ptr)
            (i32.add 
              (local.get $table_ptr) 
              (i32.mul (i32.mul (local.get $table_idx) (local.get $limbs)) (i32.const 8))
            )
            (local.get $temp1_ptr)
            (local.get $limbs)
            (local.get $limbs)
          )
          (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $mont_result_ptr) (local.get $limbs) (local.get $n_prime))
          
          (local.set $bit_pos (i32.sub (local.get $bit_pos) (local.get $win_size)))
        )
      )
      
      (br $window_outer_loop)
    )
  )
  
  ;; モンゴメリ形式から通常形式に戻す
  (local.set $i (i32.const 0))
  (block $final_copy_break
    (loop $final_copy_loop
      (br_if $final_copy_break (i32.ge_u (local.get $i) (i32.mul (local.get $limbs) (i32.const 2))))
      (i64.store 
        (i32.add (local.get $temp2_ptr) (i32.mul (local.get $i) (i32.const 8)))
        (if (result i64) (i32.lt_u (local.get $i) (local.get $limbs))
          (then
            (i64.load (i32.add (local.get $mont_result_ptr) (i32.mul (local.get $i) (i32.const 8))))
          )
          (else
            (i64.const 0)
          )
        )
      )
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $final_copy_loop)
    )
  )
  
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