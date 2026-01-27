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
;; ===== モンゴメリ modExp（修正版）=====
(func $modExpMontgomery (param $base_ptr i32) (param $exp_ptr i32) (param $mod_ptr i32) (param $result_ptr i32) (param $limbs i32)
  (local $i i32)
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
  
  ;; n_prime を計算
  (local.set $n_prime (call $computeNPrime (local.get $mod_ptr)))
  
  ;; R^2 mod N を計算
  (call $computeR2 (local.get $mod_ptr) (local.get $r2_ptr) (local.get $limbs))
  
  ;; mont_base = (base * R^2) * R^-1 mod N
  (call $mul (local.get $base_ptr) (local.get $r2_ptr) (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs))
  (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $mont_base_ptr) (local.get $limbs) (local.get $n_prime))
  
  ;; mont_result = R mod N（Montgomery形式の1）
  ;; これは単に temp1_ptr に R を設定してから mod で割るだけ
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
  
  ;; 各ビットを処理
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
          (call $mul (local.get $mont_result_ptr) (local.get $mont_base_ptr) (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs))
          (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $mont_result_ptr) (local.get $limbs) (local.get $n_prime))
        )
      )
      
      (call $mul (local.get $mont_base_ptr) (local.get $mont_base_ptr) (local.get $temp1_ptr) (local.get $limbs) (local.get $limbs))
      (call $montgomeryReduce (local.get $temp1_ptr) (local.get $mod_ptr) (local.get $mont_base_ptr) (local.get $limbs) (local.get $n_prime))
      
      (local.set $bit_pos (i32.add (local.get $bit_pos) (i32.const 1)))
      (br $outer_loop)
    )
  )
  
  ;; 🔧 修正: モンゴメリ形式から通常形式に戻す
  ;; mont_result * 1 を Montgomery Reduction する（つまり mont_result * R^-1 mod N）
  
  ;; temp2_ptr に mont_result を拡張コピー（下位 limbs のみ、上位は0）
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