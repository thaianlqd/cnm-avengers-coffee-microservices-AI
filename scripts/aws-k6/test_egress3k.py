import importlib.util,pathlib,struct,unittest
p=pathlib.Path(__file__).parent/'egress-3k.py';s=importlib.util.spec_from_file_location('egress3k',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class BindingEvidence(unittest.TestCase):
    def test_xor_address_with_padded_unknown_attribute(self):
        tx=b'synthetic012';cookie=0x2112a442
        attrs=struct.pack('!HH',0x8022,3)+b'abc\0'+struct.pack('!HHBBHI',0x20,8,0,1,443^(cookie>>16),0xc0000201^cookie)
        data=struct.pack('!HHI',0x101,len(attrs),cookie)+tx+attrs
        self.assertEqual(m.mapped_ipv4(data,tx),'192.0.2.1')
        with self.assertRaises(ValueError):m.mapped_ipv4(data,b'wrong-trans1')
        with self.assertRaises(ValueError):m.mapped_ipv4(data[:-1],tx)
    def test_error_packet_not_used_as_egress_address(self):
        tx=b'synthetic012'
        with self.assertRaises(ValueError):m.mapped_ipv4(struct.pack('!HHI',0x111,0,0x2112a442)+tx,tx)
if __name__=='__main__':unittest.main()
